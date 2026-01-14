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

  // Admin PIN state
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);

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
      setUseCustomCredentials(true);
      setShowCredentialsForm(true);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    if (useCustomCredentials && !credentialsSaved) {
      setError('Please save your AWS credentials before uploading.');
      setShowCredentialsForm(true);
      return;
    }

    // If using default credentials and PIN not verified, show PIN modal
    if (!useCustomCredentials && !pinVerified) {
      setShowPinModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('image', file);

    if (useCustomCredentials && credentialsSaved) {
      formData.append('useCustomCredentials', 'true');
      formData.append('accessKeyId', credentials.accessKeyId);
      formData.append('secretAccessKey', credentials.secretAccessKey);
      formData.append('region', credentials.region);
      formData.append('bucketName', credentials.bucketName);
    } else {
      // Send admin PIN for default credentials
      formData.append('adminPin', adminPin);
    }

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      setResult(response.data);
    } catch (err) {
      if (err.response) {
        if (err.response.data.requiresPin) {
          setPinVerified(false);
          setShowPinModal(true);
          setError('Invalid PIN. Please try again.');
        } else {
          setError(err.response.data.error || 'An error occurred while processing the image.');
        }
      } else if (err.code === 'ECONNABORTED') {
        setError('Request timed out. Please try again.');
      } else {
        setError('Failed to connect to the server. Please ensure the backend is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = () => {
    if (adminPin.length === 4) {
      setPinVerified(true);
      setShowPinModal(false);
      setError(null);
      // Trigger upload after PIN is entered
      handleUpload();
    } else {
      setError('Please enter a valid 4-digit PIN.');
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

  const ConfidenceBar = ({ value }) => (
    <div className="conf-bar">
      <div className="conf-fill" style={{ width: `${Math.min(value, 100)}%` }} />
      <span className="conf-text">{value.toFixed(0)}%</span>
    </div>
  );

  const getEmoji = (type) => {
    const map = {
      'HAPPY': '😊', 'SAD': '😢', 'ANGRY': '😠', 'CONFUSED': '😕',
      'DISGUSTED': '🤢', 'SURPRISED': '😲', 'CALM': '😌', 'FEAR': '😨',
    };
    return map[type] || '😐';
  };

  const renderFaceCard = (face, idx) => {
    // Get all emotions sorted, show top 4
    const allEmotions = face.Emotions?.sort((a, b) => b.Confidence - a.Confidence).slice(0, 4) || [];
    const topEmotion = allEmotions[0];
    
    // Head pose interpretation
    const getHeadPose = () => {
      if (!face.Pose) return null;
      const { Yaw, Pitch, Roll } = face.Pose;
      let direction = [];
      if (Math.abs(Yaw) > 15) direction.push(Yaw > 0 ? 'Right' : 'Left');
      if (Math.abs(Pitch) > 10) direction.push(Pitch > 0 ? 'Up' : 'Down');
      if (direction.length === 0) return 'Straight';
      return `Tilted ${direction.join(' & ')}`;
    };

    // Eye direction interpretation
    const getEyeDirection = () => {
      if (!face.EyeDirection) return null;
      const { Yaw, Pitch } = face.EyeDirection;
      if (Math.abs(Yaw) < 5 && Math.abs(Pitch) < 5) return 'Looking at camera';
      let dir = [];
      if (Math.abs(Yaw) > 5) dir.push(Yaw > 0 ? 'right' : 'left');
      if (Math.abs(Pitch) > 5) dir.push(Pitch > 0 ? 'up' : 'down');
      return `Looking ${dir.join(' & ')}`;
    };

    // Quality assessment
    const getQualityScore = () => {
      if (!face.Quality) return null;
      const avg = (face.Quality.Brightness + face.Quality.Sharpness) / 2;
      if (avg > 70) return { label: 'Excellent', color: '#10b981' };
      if (avg > 50) return { label: 'Good', color: '#8b5cf6' };
      return { label: 'Fair', color: '#f59e0b' };
    };

    const quality = getQualityScore();
    
    return (
      <div key={idx} className="face-card">
        {getFacesCount() > 1 && <div className="face-num">Person {idx + 1}</div>}
        
        {/* Primary Stats Grid */}
        <div className="face-grid">
          {/* Demographics */}
          <div className="stat-block">
            <div className="stat-icon">👤</div>
            <div className="stat-content">
              <span className="stat-label">Demographics</span>
              <span className="stat-value">
                {face.Gender?.Value}, {face.AgeRange?.Low}-{face.AgeRange?.High} yrs
              </span>
            </div>
          </div>

          {/* Primary Emotion */}
          {topEmotion && (
            <div className="stat-block">
              <div className="stat-icon">{getEmoji(topEmotion.Type)}</div>
              <div className="stat-content">
                <span className="stat-label">Dominant Mood</span>
                <span className="stat-value">{topEmotion.Type.toLowerCase()} ({topEmotion.Confidence.toFixed(0)}%)</span>
              </div>
            </div>
          )}

          {/* Expression */}
          <div className="stat-block">
            <div className="stat-icon">{face.Smile?.Value ? '😄' : '😐'}</div>
            <div className="stat-content">
              <span className="stat-label">Expression</span>
              <span className="stat-value">{face.Smile?.Value ? 'Smiling' : 'Neutral'}</span>
            </div>
          </div>

          {/* Head Pose */}
          {getHeadPose() && (
            <div className="stat-block">
              <div className="stat-icon">🎯</div>
              <div className="stat-content">
                <span className="stat-label">Head Position</span>
                <span className="stat-value">{getHeadPose()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Emotion Breakdown */}
        {allEmotions.length > 0 && (
          <div className="emotions-section">
            <h4>Emotion Breakdown</h4>
            <div className="emotions-bars">
              {allEmotions.map((em, i) => (
                <div key={i} className="emotion-row">
                  <span className="em-label">{getEmoji(em.Type)} {em.Type.toLowerCase()}</span>
                  <ConfidenceBar value={em.Confidence} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advanced Insights */}
        <div className="insights-section">
          <h4>Advanced Insights</h4>
          <div className="insights-grid">
            {/* Eye Direction */}
            {getEyeDirection() && (
              <div className="insight-item">
                <span className="insight-icon">👁️</span>
                <div>
                  <span className="insight-label">Gaze</span>
                  <span className="insight-value">{getEyeDirection()}</span>
                </div>
              </div>
            )}

            {/* Face Visibility */}
            <div className="insight-item">
              <span className="insight-icon">{face.FaceOccluded?.Value ? '🙈' : '✓'}</span>
              <div>
                <span className="insight-label">Visibility</span>
                <span className="insight-value">{face.FaceOccluded?.Value ? 'Partially hidden' : 'Fully visible'}</span>
              </div>
            </div>

            {/* Eyes Status */}
            <div className="insight-item">
              <span className="insight-icon">{face.EyesOpen?.Value ? '👀' : '😑'}</span>
              <div>
                <span className="insight-label">Eyes</span>
                <span className="insight-value">{face.EyesOpen?.Value ? 'Open' : 'Closed'}</span>
              </div>
            </div>

            {/* Mouth Status */}
            <div className="insight-item">
              <span className="insight-icon">{face.MouthOpen?.Value ? '😮' : '😶'}</span>
              <div>
                <span className="insight-label">Mouth</span>
                <span className="insight-value">{face.MouthOpen?.Value ? 'Open' : 'Closed'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Image Quality */}
        {face.Quality && (
          <div className="quality-section">
            <h4>Image Quality</h4>
            <div className="quality-bars">
              <div className="quality-row">
                <span>☀️ Brightness</span>
                <ConfidenceBar value={face.Quality.Brightness} />
              </div>
              <div className="quality-row">
                <span>📷 Sharpness</span>
                <ConfidenceBar value={face.Quality.Sharpness} />
              </div>
            </div>
            {quality && (
              <div className="quality-badge" style={{ background: `${quality.color}20`, color: quality.color }}>
                Overall: {quality.label}
              </div>
            )}
          </div>
        )}

        {/* Feature Tags */}
        <div className="features-row">
          {face.Eyeglasses?.Value && <span className="tag">👓 Glasses</span>}
          {face.Sunglasses?.Value && <span className="tag">🕶️ Sunglasses</span>}
          {face.Beard?.Value && face.Beard.Confidence >= 70 && <span className="tag">🧔 Beard</span>}
          {face.Mustache?.Value && face.Mustache.Confidence >= 70 && <span className="tag">👨 Mustache</span>}
          {!face.Beard?.Value && !face.Mustache?.Value && face.Gender?.Value === 'Male' && <span className="tag active">✨ Clean shaven</span>}
          {face.Smile?.Value && face.Smile.Confidence >= 80 && <span className="tag active">� Smiling</span>}
        </div>

        {/* Confidence Footer */}
        <div className="confidence-footer">
          <span>Detection confidence</span>
          <span className="accuracy">{face.Confidence?.toFixed(1)}%</span>
        </div>
      </div>
    );
  };


  return (
    <div className="app">
      {/* Nav */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="logo">
            <img src="https://th.bing.com/th/id/OIP.85Tis7jqCiN1-4gjC8AMrgAAAA?w=140&h=150&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3" alt="FaceAI" />
          </div>
          <span className="brand-text">Cloud Vision</span>
        </div>
        <div className="nav-actions">
          <label className="cred-toggle">
            <span>Own AWS</span>
            <input type="checkbox" checked={useCustomCredentials} onChange={handleToggleCustomCredentials} />
            <span className="slider"></span>
          </label>
        </div>
      </nav>

      {/* Credentials Modal */}
      {showCredentialsForm && (
        <div className="modal-backdrop" onClick={() => setShowCredentialsForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🔐 AWS Configuration</h3>
              <button onClick={() => setShowCredentialsForm(false)}>✕</button>
            </div>
            <div className="modal-content">
              <p className="modal-desc">Enter your AWS credentials to use your own S3 bucket and Rekognition service.</p>
              
              <label>Access Key ID</label>
              <input type="text" name="accessKeyId" value={credentials.accessKeyId} onChange={handleCredentialsChange} placeholder="AKIA..." />
              
              <label>Secret Access Key</label>
              <input type="password" name="secretAccessKey" value={credentials.secretAccessKey} onChange={handleCredentialsChange} placeholder="Your secret key" />
              
              <div className="input-row">
                <div>
                  <label>Region</label>
                  <select name="region" value={credentials.region} onChange={handleCredentialsChange}>
                    <optgroup label="United States">
                      <option value="us-east-1">N. Virginia (us-east-1)</option>
                      <option value="us-east-2">Ohio (us-east-2)</option>
                      <option value="us-west-1">N. California (us-west-1)</option>
                      <option value="us-west-2">Oregon (us-west-2)</option>
                    </optgroup>
                    <optgroup label="Asia Pacific">
                      <option value="ap-south-1">Mumbai (ap-south-1)</option>
                      <option value="ap-northeast-3">Osaka (ap-northeast-3)</option>
                      <option value="ap-northeast-2">Seoul (ap-northeast-2)</option>
                      <option value="ap-southeast-1">Singapore (ap-southeast-1)</option>
                      <option value="ap-southeast-2">Sydney (ap-southeast-2)</option>
                      <option value="ap-northeast-1">Tokyo (ap-northeast-1)</option>
                    </optgroup>
                    <optgroup label="Canada">
                      <option value="ca-central-1">Central (ca-central-1)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="eu-central-1">Frankfurt (eu-central-1)</option>
                      <option value="eu-west-1">Ireland (eu-west-1)</option>
                      <option value="eu-west-2">London (eu-west-2)</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label>Bucket Name</label>
                  <input type="text" name="bucketName" value={credentials.bucketName} onChange={handleCredentialsChange} placeholder="my-bucket" />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowCredentialsForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveCredentials}>Save & Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin PIN Modal */}
      {showPinModal && (
        <div className="modal-backdrop" onClick={() => setShowPinModal(false)}>
          <div className="modal pin-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🔐 Admin Access Required</h3>
              <button onClick={() => setShowPinModal(false)}>✕</button>
            </div>
            <div className="modal-content">
              <p className="modal-desc">Enter the admin PIN to use default AWS credentials.</p>
              
              <div className="pin-input-container">
                <input 
                  type="password" 
                  maxLength="4" 
                  value={adminPin} 
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="pin-input"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                />
              </div>
              
              <p className="pin-hint">Or toggle "Own AWS" to use your own credentials</p>
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowPinModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handlePinSubmit}>Verify & Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom creds badge */}
      {useCustomCredentials && credentialsSaved && (
        <div className="cred-badge">
          ✓ Using <strong>{credentials.bucketName}</strong>
          <button onClick={() => setShowCredentialsForm(true)}>Edit</button>
        </div>
      )}

      {/* Hero Section */}
      <main className="main">
        <div className="hero">
          <a 
            href="https://www.linkedin.com/company/nist-cloud-computing-club/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hero-badge"
          >
            Cloud Computing Club
            <span className="badge-tooltip">✨ Follow us on LinkedIn</span>
          </a>
          <h1>Facial Analysis<br /><span>Made Simple</span></h1>
          <p>Upload any photo and get instant AI-powered insights about age, emotions, and facial features.</p>
        </div>

        {/* Upload Area */}
        {!result && (
          <div className="upload-section">
            <div 
              className={`dropzone ${dragOver ? 'active' : ''} ${file ? 'has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handleInputChange} hidden />
              
              {!file ? (
                <>
                  <div className="drop-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="drop-text">Drag your image here or <span>browse files</span></p>
                  <p className="drop-hint">JPG, PNG up to 10MB</p>
                </>
              ) : (
                <div className="preview-area">
                  <img src={preview} alt="Preview" />
                  <div className="preview-info">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(); }}>✕</button>
                </div>
              )}
            </div>

            <button className="analyze-btn" onClick={handleUpload} disabled={!file || loading}>
              {loading ? (
                <><span className="spinner"></span> Analyzing...</>
              ) : (
                <>Analyze Face</>
              )}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-box">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="loading-box">
            <div className="loader"></div>
            <p>Processing image with AWS Rekognition...</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="results">
            <div className="result-header">
              <button className="back-btn" onClick={removeFile}>← New Analysis</button>
              <div className="header-badges">
                {/* Show analysis type based on what was detected */}
                {result.moderation?.ModerationLabels?.length > 0 ? (
                  <span className="moderation-badge warning">🔞 Content Moderation</span>
                ) : (
                  <span className="face-count">👤 Face Detection • {getFacesCount()} face{getFacesCount() !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            <div className="result-grid">
              <div className="result-image">
                <img src={preview} alt="Analyzed" />
                {result.moderation?.Summary?.ExplicitContentDetected && (
                  <div className="moderation-overlay">
                    <span>⚠️ Explicit Content Detected</span>
                  </div>
                )}
              </div>

              <div className="result-cards">
                {/* CONDITIONAL: Show ONLY Moderation OR Face Detection */}
                {result.moderation?.ModerationLabels?.length > 0 ? (
                  /* ========== MODERATION RESULTS ========== */
                  <div className="moderation-card">
                    <div className="moderation-header">
                      <span className="mod-icon">🔞</span>
                      <div>
                        <h3>Content Moderation Analysis</h3>
                        <p className="mod-subtitle">{result.moderation.ModerationLabels.length} labels detected</p>
                      </div>
                      {result.moderation.Summary?.ExplicitContentDetected && (
                        <span className="explicit-tag">EXPLICIT</span>
                      )}
                    </div>

                    {/* Risk Level */}
                    <div className="risk-section">
                      <span className="risk-label">Risk Level</span>
                      <div className="risk-meter">
                        {(() => {
                          const maxConf = Math.max(...result.moderation.ModerationLabels.map(l => l.Confidence));
                          const riskLevel = maxConf > 90 ? 'High' : maxConf > 70 ? 'Medium' : 'Low';
                          const riskColor = maxConf > 90 ? '#ef4444' : maxConf > 70 ? '#f59e0b' : '#10b981';
                          return (
                            <>
                              <div className="risk-bar" style={{ width: `${maxConf}%`, background: riskColor }} />
                              <span className="risk-text" style={{ color: riskColor }}>{riskLevel} ({maxConf.toFixed(0)}%)</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="mod-categories">
                      <h4>Detected Categories</h4>
                      <div className="category-list">
                        {result.moderation.ModerationLabels
                          .filter(l => l.TaxonomyLevel === 1 || l.TaxonomyLevel === 2)
                          .map((label, idx) => (
                            <div key={idx} className="category-item">
                              <span className="cat-name">{label.Name}</span>
                              <ConfidenceBar value={label.Confidence} />
                            </div>
                          ))
                        }
                      </div>
                    </div>

                    {/* Detailed Labels */}
                    {result.moderation.ModerationLabels.filter(l => l.TaxonomyLevel === 3).length > 0 && (
                      <div className="mod-details">
                        <h4>Specific Detections</h4>
                        <div className="label-tags">
                          {result.moderation.ModerationLabels
                            .filter(l => l.TaxonomyLevel === 3)
                            .map((label, idx) => (
                              <span key={idx} className="label-tag" title={`Confidence: ${label.Confidence.toFixed(1)}%`}>
                                {label.Name}
                                <span className="tag-conf">{label.Confidence.toFixed(0)}%</span>
                              </span>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    {/* Category Hierarchy */}
                    {result.moderation.ModerationLabels.some(l => l.ParentName) && (
                      <div className="mod-hierarchy">
                        <h4>Category Hierarchy</h4>
                        <div className="hierarchy-tree">
                          {[...new Set(result.moderation.ModerationLabels
                            .filter(l => l.TaxonomyLevel === 1)
                            .map(l => l.Name))]
                            .map((parent, idx) => (
                              <div key={idx} className="hierarchy-branch">
                                <span className="parent-cat">📁 {parent}</span>
                                <div className="child-cats">
                                  {result.moderation.ModerationLabels
                                    .filter(l => l.ParentName === parent || 
                                      result.moderation.ModerationLabels.some(p => p.Name === l.ParentName && p.ParentName === parent))
                                    .map((child, cidx) => (
                                      <span key={cidx} className="child-cat">└ {child.Name}</span>
                                    ))
                                  }
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ========== FACE DETECTION RESULTS ========== */
                  <>
                    {getFacesCount() === 0 ? (
                      <div className="no-face">
                        <span>🤷</span>
                        <h3>No faces found</h3>
                        <p>Try a clearer photo with visible faces</p>
                      </div>
                    ) : (
                      result.result?.FaceDetails?.map((face, idx) => renderFaceCard(face, idx))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Built with 🩵 by Harsh Deo</p>
      </footer>
    </div>
  );
}

export default App;
