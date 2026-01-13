import React, { useState, useRef } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Custom credentials state
  const [useCustomCredentials, setUseCustomCredentials] = useState(false);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [credentials, setCredentials] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'ap-south-1',
    bucketName: '',
  });
  const [credentialsSaved, setCredentialsSaved] = useState(false);

  const handleFileSelect = (selectedFile) => {
    if (selectedFile) {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Invalid file type. Please select a JPEG or PNG image.');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit.');
        return;
      }
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setError(null);
      setResult(null);
    }
  };

  const handleInputChange = (e) => {
    handleFileSelect(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const removeFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCredentialsChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveCredentials = () => {
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.region || !credentials.bucketName) {
      setError('Please fill in all credential fields.');
      return;
    }
    setCredentialsSaved(true);
    setShowCredentialsForm(false);
    setError(null);
  };

  const handleToggleCustomCredentials = () => {
    if (useCustomCredentials) {
      // Turning off - reset everything
      setUseCustomCredentials(false);
      setShowCredentialsForm(false);
      setCredentialsSaved(false);
      setCredentials({
        accessKeyId: '',
        secretAccessKey: '',
        region: 'ap-south-1',
        bucketName: '',
      });
    } else {
      // Turning on - show form
      setUseCustomCredentials(true);
      setShowCredentialsForm(true);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    // Check if custom credentials are enabled but not saved
    if (useCustomCredentials && !credentialsSaved) {
      setError('Please save your AWS credentials before uploading.');
      setShowCredentialsForm(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('image', file);

    // Add custom credentials if enabled
    if (useCustomCredentials && credentialsSaved) {
      formData.append('useCustomCredentials', 'true');
      formData.append('accessKeyId', credentials.accessKeyId);
      formData.append('secretAccessKey', credentials.secretAccessKey);
      formData.append('region', credentials.region);
      formData.append('bucketName', credentials.bucketName);
    }

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000,
      });
      setResult(response.data);
    } catch (err) {
      if (err.response) {
        setError(err.response.data.error || 'An error occurred while processing the image.');
      } else if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please try again.');
      } else {
        setError('Failed to connect to the server. Please ensure the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFacesCount = () => {
    if (!result?.result?.FaceDetails) return 0;
    return result.result.FaceDetails.length;
  };

  // Helper to get emotion with highest confidence
  const getTopEmotion = (emotions) => {
    if (!emotions || emotions.length === 0) return null;
    return emotions.reduce((prev, curr) => 
      curr.Confidence > prev.Confidence ? curr : prev
    );
  };

  // Confidence bar component
  const ConfidenceBar = ({ value }) => (
    <div className="confidence-bar-container">
      <div 
        className="confidence-bar-fill" 
        style={{ 
          width: `${value}%`,
          background: value > 90 ? '#38ef7d' : value > 70 ? '#667eea' : '#f5576c'
        }}
      />
      <span className="confidence-value">{value.toFixed(1)}%</span>
    </div>
  );

  // Render a single face analysis
  const renderFaceAnalysis = (face, index) => {
    // Filter emotions above 70%
    const significantEmotions = face.Emotions?.filter(e => e.Confidence >= 70) || [];
    
    return (
      <div key={index} className="face-analysis">
        {getFacesCount() > 1 && (
          <div className="face-label">Face {index + 1}</div>
        )}
        
        {/* Age & Gender Section */}
        <div className="analysis-section">
          <h4 className="section-title">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
            Demographics
          </h4>
          <div className="info-grid">
            {face.AgeRange && (
              <div className="info-item">
                <span className="info-label">Age Range</span>
                <span className="info-value highlight">{face.AgeRange.Low} - {face.AgeRange.High} years</span>
              </div>
            )}
            {face.Gender && face.Gender.Confidence >= 70 && (
              <div className="info-item">
                <span className="info-label">Gender</span>
                <span className="info-value">{face.Gender.Value}</span>
                <ConfidenceBar value={face.Gender.Confidence} />
              </div>
            )}
          </div>
        </div>

        {/* Emotions Section */}
        {significantEmotions.length > 0 && (
          <div className="analysis-section">
            <h4 className="section-title">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
              </svg>
              Emotions
            </h4>
            <div className="emotions-list">
              {significantEmotions
                .sort((a, b) => b.Confidence - a.Confidence)
                .map((emotion, i) => (
                  <div key={i} className="emotion-item">
                    <span className="emotion-label">
                      {getEmotionEmoji(emotion.Type)} {emotion.Type}
                    </span>
                    <ConfidenceBar value={emotion.Confidence} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Facial Features Section */}
        <div className="analysis-section">
          <h4 className="section-title">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            Facial Features
          </h4>
          <div className="features-grid">
            {face.Smile && face.Smile.Confidence >= 70 && (
              <div className={`feature-badge ${face.Smile.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">😊</span>
                <span>{face.Smile.Value ? 'Smiling' : 'Not Smiling'}</span>
              </div>
            )}
            {face.Eyeglasses && face.Eyeglasses.Confidence >= 70 && (
              <div className={`feature-badge ${face.Eyeglasses.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">👓</span>
                <span>{face.Eyeglasses.Value ? 'Wearing Glasses' : 'No Glasses'}</span>
              </div>
            )}
            {face.Sunglasses && face.Sunglasses.Confidence >= 70 && (
              <div className={`feature-badge ${face.Sunglasses.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">🕶️</span>
                <span>{face.Sunglasses.Value ? 'Sunglasses' : 'No Sunglasses'}</span>
              </div>
            )}
            {face.Beard && face.Beard.Confidence >= 70 && (
              <div className={`feature-badge ${face.Beard.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">🧔</span>
                <span>{face.Beard.Value ? 'Has Beard' : 'No Beard'}</span>
              </div>
            )}
            {face.Mustache && face.Mustache.Confidence >= 70 && (
              <div className={`feature-badge ${face.Mustache.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">👨</span>
                <span>{face.Mustache.Value ? 'Has Mustache' : 'No Mustache'}</span>
              </div>
            )}
            {face.EyesOpen && face.EyesOpen.Confidence >= 70 && (
              <div className={`feature-badge ${face.EyesOpen.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">👁️</span>
                <span>{face.EyesOpen.Value ? 'Eyes Open' : 'Eyes Closed'}</span>
              </div>
            )}
            {face.MouthOpen && face.MouthOpen.Confidence >= 70 && (
              <div className={`feature-badge ${face.MouthOpen.Value ? 'active' : 'inactive'}`}>
                <span className="feature-icon">👄</span>
                <span>{face.MouthOpen.Value ? 'Mouth Open' : 'Mouth Closed'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Image Quality Section */}
        {face.Quality && (
          <div className="analysis-section">
            <h4 className="section-title">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
              Image Quality
            </h4>
            <div className="quality-grid">
              <div className="quality-item">
                <span className="quality-label">Brightness</span>
                <ConfidenceBar value={face.Quality.Brightness} />
              </div>
              <div className="quality-item">
                <span className="quality-label">Sharpness</span>
                <ConfidenceBar value={face.Quality.Sharpness} />
              </div>
            </div>
          </div>
        )}

        {/* Overall Confidence */}
        <div className="overall-confidence">
          <span>Detection Confidence</span>
          <div className="confidence-pill">
            {face.Confidence?.toFixed(1)}%
          </div>
        </div>
      </div>
    );
  };

  const getEmotionEmoji = (emotion) => {
    const emojis = {
      'HAPPY': '😊',
      'SAD': '😢',
      'ANGRY': '😠',
      'CONFUSED': '😕',
      'DISGUSTED': '🤢',
      'SURPRISED': '😲',
      'CALM': '😌',
      'FEAR': '😨',
    };
    return emojis[emotion] || '😐';
  };

  return (
    <div className="app-container">
      {/* Custom Credentials Toggle */}
      <div className="credentials-toggle-bar">
        <div className="toggle-content">
          <div className="toggle-info">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
            <span>Use Your Own AWS Credentials</span>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={useCustomCredentials}
              onChange={handleToggleCustomCredentials}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        {useCustomCredentials && credentialsSaved && (
          <div className="credentials-status">
            <span className="status-badge success">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              Using custom credentials for {credentials.bucketName}
            </span>
            <button className="edit-credentials-btn" onClick={() => setShowCredentialsForm(true)}>
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Credentials Form Modal */}
      {showCredentialsForm && (
        <div className="modal-overlay" onClick={() => setShowCredentialsForm(false)}>
          <div className="credentials-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
                Enter AWS Credentials
              </h3>
              <button className="modal-close" onClick={() => setShowCredentialsForm(false)}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="security-notice">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                </svg>
                <div>
                  <strong>Secure Processing</strong>
                  <p>Your credentials are sent directly to the backend and are not stored. They're used only for this session.</p>
                </div>
              </div>

              <div className="form-group">
                <label>AWS Access Key ID</label>
                <input
                  type="text"
                  name="accessKeyId"
                  value={credentials.accessKeyId}
                  onChange={handleCredentialsChange}
                  placeholder="AKIA..."
                />
              </div>

              <div className="form-group">
                <label>AWS Secret Access Key</label>
                <input
                  type="password"
                  name="secretAccessKey"
                  value={credentials.secretAccessKey}
                  onChange={handleCredentialsChange}
                  placeholder="Your secret key"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>AWS Region</label>
                  <select
                    name="region"
                    value={credentials.region}
                    onChange={handleCredentialsChange}
                  >
                    <option value="ap-south-1">Asia Pacific (Mumbai)</option>
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">Europe (Ireland)</option>
                    <option value="eu-central-1">Europe (Frankfurt)</option>
                    <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                    <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>S3 Bucket Name</label>
                  <input
                    type="text"
                    name="bucketName"
                    value={credentials.bucketName}
                    onChange={handleCredentialsChange}
                    placeholder="your-bucket-name"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCredentialsForm(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveCredentials}>
                Save Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="header-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        </div>
        <h1>Face Detection</h1>
        <p>Upload an image to detect faces using AWS Rekognition</p>
      </header>

      {/* Upload Card */}
      <div className="upload-card">
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleInputChange}
            className="file-input"
          />
          <div className="drop-zone-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
            </svg>
          </div>
          <h3>{file ? 'Click or drop to replace' : 'Drop your image here'}</h3>
          <p>or click to browse • JPEG, PNG up to 10MB</p>
        </div>

        {file && !result && (
          <>
            <div className="selected-file">
              <div className="file-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
              </div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{formatFileSize(file.size)}</div>
              </div>
              <button className="remove-file" onClick={(e) => { e.stopPropagation(); removeFile(); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {preview && (
              <div className="image-preview-container">
                <img src={preview} alt="Preview" className="image-preview" />
              </div>
            )}
          </>
        )}

        {!result && (
          <button
            className="upload-button"
            onClick={handleUpload}
            disabled={!file || loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Analyzing...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
                Analyze Image
              </>
            )}
          </button>
        )}
      </div>

      {/* Status Messages */}
      {loading && (
        <div className="status-message loading">
          <div className="spinner status-icon"></div>
          <div className="status-text">
            <h4>Processing your image</h4>
            <p>
              {useCustomCredentials 
                ? `Uploading to ${credentials.bucketName} and waiting for Rekognition analysis...`
                : 'Uploading to S3 and waiting for Rekognition analysis...'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="status-message error">
          <svg className="status-icon" viewBox="0 0 24 24" fill="#f45c43">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <div className="status-text">
            <h4>Error</h4>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Results Layout - Image Left, Analysis Right */}
      {result && !loading && (
        <div className="results-container">
          {/* Left Side - Image */}
          <div className="results-image-section">
            <div className="image-card">
              <img src={preview} alt="Analyzed" className="analyzed-image" />
              <div className="image-overlay">
                <span className="faces-badge">
                  {getFacesCount()} Face{getFacesCount() !== 1 ? 's' : ''} Detected
                </span>
              </div>
            </div>
            <button className="new-analysis-btn" onClick={removeFile}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Analyze New Image
            </button>
          </div>

          {/* Right Side - Analysis */}
          <div className="results-analysis-section">
            <div className="analysis-header">
              <h2>
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
                Face Analysis Results
              </h2>
              <p className="analysis-subtitle">
                Showing attributes with confidence ≥ 70%
              </p>
            </div>

            {result.result?.FaceDetails?.map((face, index) => 
              renderFaceAnalysis(face, index)
            )}

            {getFacesCount() === 0 && (
              <div className="no-faces">
                <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
                </svg>
                <h3>No Faces Detected</h3>
                <p>Try uploading an image with clearer faces</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>Powered by <a href="https://aws.amazon.com/rekognition/" target="_blank" rel="noopener noreferrer">AWS Rekognition</a></p>
      </footer>
    </div>
  );
}

export default App;
