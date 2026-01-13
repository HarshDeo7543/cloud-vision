require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS
app.use(cors());
app.use(express.json());

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG images are allowed.'), false);
    }
  },
});

// Default S3 Client (uses server's .env credentials)
const defaultS3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const DEFAULT_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'rekog-input-bucket-xyz';

// Create S3 client with custom credentials
function createCustomS3Client(credentials) {
  return new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
}

// Helper function to check if result file exists
async function checkResultExists(s3Client, bucketName, resultKey) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: resultKey,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

// Helper function to get result file content
async function getResultContent(s3Client, bucketName, resultKey) {
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: bucketName,
    Key: resultKey,
  }));
  
  const bodyContents = await streamToString(response.Body);
  return JSON.parse(bodyContents);
}

// Helper function to convert stream to string
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// Poll for result with timeout
async function pollForResult(s3Client, bucketName, resultKey, maxAttempts = 15, intervalMs = 1000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const exists = await checkResultExists(s3Client, bucketName, resultKey);
    if (exists) {
      return await getResultContent(s3Client, bucketName, resultKey);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout: Result file not found within the expected time.');
}

// Upload endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    // Check if custom credentials are provided
    let s3Client = defaultS3Client;
    let bucketName = DEFAULT_BUCKET_NAME;
    let usingCustomCredentials = false;

    // Parse custom credentials from form data if provided
    if (req.body.useCustomCredentials === 'true') {
      const { accessKeyId, secretAccessKey, region, bucketName: customBucket } = req.body;
      
      if (!accessKeyId || !secretAccessKey || !region || !customBucket) {
        return res.status(400).json({ 
          error: 'Custom credentials mode requires: accessKeyId, secretAccessKey, region, and bucketName' 
        });
      }

      s3Client = createCustomS3Client({
        accessKeyId,
        secretAccessKey,
        region,
      });
      bucketName = customBucket;
      usingCustomCredentials = true;
      console.log(`Using custom credentials for bucket: ${bucketName} in region: ${region}`);
    }

    const originalName = req.file.originalname;
    const s3Key = originalName;  // Upload directly to bucket root
    
    // Lambda creates result as: filename.result.json (without original extension)
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
    const resultKey = `${nameWithoutExt}.result.json`;

    console.log(`Uploading file: ${originalName} to S3 key: ${s3Key}`);

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    console.log('File uploaded successfully. Waiting for Rekognition result...');

    // Poll for result
    const result = await pollForResult(s3Client, bucketName, resultKey);

    console.log('Result received successfully.');

    // Destroy custom client if created
    if (usingCustomCredentials) {
      s3Client.destroy();
    }

    res.json({
      success: true,
      filename: originalName,
      result: result,
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('Timeout')) {
      return res.status(504).json({ error: error.message });
    }
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.name === 'CredentialsProviderError' || error.message.includes('credential')) {
      return res.status(401).json({ error: 'Invalid AWS credentials provided.' });
    }

    if (error.name === 'NoSuchBucket') {
      return res.status(400).json({ error: 'The specified S3 bucket does not exist.' });
    }

    if (error.name === 'AccessDenied') {
      return res.status(403).json({ error: 'Access denied. Check your AWS credentials and bucket permissions.' });
    }

    res.status(500).json({ error: 'An error occurred while processing the image.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds the 10MB limit.' });
    }
    return res.status(400).json({ error: error.message });
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({ error: error.message });
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
