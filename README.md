# AWS Rekognition Face Detection Web Application

A full-stack web application for face detection using AWS Rekognition.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  Express Backend│────▶│   AWS S3        │
│  (File Upload)  │◀────│  (API Server)   │◀────│   (Storage)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  AWS Lambda     │
                                                │  (Rekognition)  │
                                                └─────────────────┘
```

## Prerequisites

- Node.js 18+ installed
- AWS account with configured credentials
- Existing AWS infrastructure (S3 bucket, Lambda function)

## Project Structure

```
cloud vision/
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── .env.example
│   └── .env (create this)
├── frontend/
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── index.css
│       └── App.js
└── README.md
```

## Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your AWS credentials
```

**Required Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key | `wJalr...` |
| `AWS_REGION` | AWS region | `ap-south-1` |
| `S3_BUCKET_NAME` | S3 bucket name | `rekog-input-bucket-xyz` |
| `PORT` | Server port | `5000` |

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

**Optional Environment Variables:**

Create a `.env` file in the frontend folder if your backend runs on a different URL:

```
REACT_APP_API_URL=http://localhost:5000
```

## Running the Application

### Start Backend Server

```bash
cd backend
npm run dev
```

The backend will start on `http://localhost:5000`

### Start Frontend Dev Server

```bash
cd frontend
npm start
```

The frontend will start on `http://localhost:3000`

## API Endpoints

### POST /upload

Upload an image for face detection.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `image` (file) - JPEG or PNG image, max 10MB

**Response (Success):**
```json
{
  "success": true,
  "filename": "face.jpg",
  "result": {
    "FaceDetails": [...]
  }
}
```

**Response (Error):**
```json
{
  "error": "Error message"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-05T10:00:00.000Z"
}
```

## Features

- **Drag & Drop Upload**: Drag images directly onto the upload zone
- **File Preview**: See a preview of your image before uploading
- **Loading States**: Visual feedback during processing
- **Error Handling**: Clear error messages for invalid files or server issues
- **JSON Viewer**: Pretty-printed, syntax-highlighted results
- **Responsive Design**: Works on desktop and mobile devices

## Security Notes

- AWS credentials are stored only on the backend
- Frontend never has access to AWS credentials
- File type and size validation on both frontend and backend
- CORS configured for local development

## Troubleshooting

**Backend won't start:**
- Ensure `.env` file exists with valid AWS credentials
- Check that port 5000 is available

**Frontend can't connect to backend:**
- Ensure backend is running on port 5000
- Check browser console for CORS errors

**Upload times out:**
- Lambda function may be cold starting
- Check Lambda CloudWatch logs for errors
- Verify S3 bucket permissions

**Invalid credentials error:**
- Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
- Ensure IAM user has S3 permissions for the bucket
