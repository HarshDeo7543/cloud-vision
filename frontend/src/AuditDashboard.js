import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AuditDashboard() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [storedPin, setStoredPin] = useState('');

  const fetchAuditData = async (adminPin) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/audit`, {
        params: { pin: adminPin },
        timeout: 15000,
      });
      setAuditData(response.data);
      setAuthenticated(true);
      setStoredPin(adminPin);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Invalid admin PIN.');
        setAuthenticated(false);
      } else {
        setError('Failed to fetch audit data. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pin.length === 4) {
      fetchAuditData(pin);
    } else {
      setError('Please enter a valid 4-digit PIN.');
    }
  };

  const handleRefresh = () => {
    fetchAuditData(storedPin);
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setAuditData(null);
    setPin('');
    setStoredPin('');
    setError(null);
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredEntries = () => {
    if (!auditData?.entries) return [];
    let entries = [...auditData.entries]; // already sorted newest-first from backend
    if (filter === 'face') entries = entries.filter(e => e.analysisMode === 'face');
    if (filter === 'moderation') entries = entries.filter(e => e.analysisMode === 'moderation');
    if (filter === 'custom') entries = entries.filter(e => e.credentialType === 'custom');
    if (filter === 'default') entries = entries.filter(e => e.credentialType === 'default');
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      entries = entries.filter(e =>
        e.originalFilename?.toLowerCase().includes(term) ||
        e.bucketName?.toLowerCase().includes(term) ||
        e.ip?.includes(term) ||
        e.iamUsername?.toLowerCase().includes(term) ||
        e.accessKeyPrefix?.toLowerCase().includes(term)
      );
    }
    return entries;
  };

  // PIN login screen
  if (!authenticated) {
    return (
      <div className="audit-app">
        <div className="audit-login">
          <div className="audit-login-card">
            <div className="audit-login-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2>Audit Dashboard</h2>
            <p>Enter admin PIN to access upload history</p>
            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                maxLength="4"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="audit-pin-input"
                autoFocus
              />
              {error && <div className="audit-error">{error}</div>}
              <button type="submit" className="audit-login-btn" disabled={loading}>
                {loading ? 'Verifying...' : 'Access Dashboard'}
              </button>
            </form>
            <a href="/" className="audit-back-link">← Back to App</a>
          </div>
        </div>
      </div>
    );
  }

  const entries = filteredEntries();
  const stats = auditData?.stats;

  return (
    <div className="audit-app">
      {/* Header */}
      <header className="audit-header">
        <div className="audit-header-left">
          <h1>Audit Dashboard</h1>
          <span className="audit-header-badge">{stats?.totalUploads || 0} uploads</span>
        </div>
        <div className="audit-header-right">
          <button className="audit-btn-refresh" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="audit-btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Stats Cards */}
      {stats && (
        <div className="audit-stats">
          <div className="audit-stat-card">
            <span className="stat-number">{stats.totalRequests || 0}</span>
            <span className="stat-label">Total Requests</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.totalUploads}</span>
            <span className="stat-label">Total Uploads</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.uniqueIPs}</span>
            <span className="stat-label">Unique IPs</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.uniqueBuckets?.length || 0}</span>
            <span className="stat-label">Buckets Used</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.uniqueIAMUsers?.length || 0}</span>
            <span className="stat-label">IAM Users</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.byMode?.face || 0}</span>
            <span className="stat-label">Face Analyses</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.byMode?.moderation || 0}</span>
            <span className="stat-label">Moderation Checks</span>
          </div>
          <div className="audit-stat-card">
            <span className="stat-number">{stats.byCredentialType?.custom || 0}</span>
            <span className="stat-label">Custom Creds</span>
          </div>
        </div>
      )}

      {/* Buckets List */}
      {stats?.uniqueBuckets?.length > 0 && (
        <div className="audit-buckets">
          <h3>Buckets Used</h3>
          <div className="bucket-tags">
            {stats.uniqueBuckets.map((b, i) => (
              <span key={i} className="bucket-tag">{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="audit-controls">
        <div className="audit-filters">
          {['all', 'face', 'moderation', 'custom', 'default'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'face' ? 'Face' : f === 'moderation' ? 'Moderation' : f === 'custom' ? 'Custom Creds' : 'Default Creds'}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search filename, bucket, IP..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="audit-search"
        />
      </div>

      {/* Results count */}
      <div className="audit-results-info">
        Showing {entries.length} of {auditData?.entries?.length || 0} entries
      </div>

      {/* Entries Grid */}
      <div className="audit-grid">
        {entries.length === 0 ? (
          <div className="audit-empty">No audit entries found.</div>
        ) : (
          entries.map((entry, idx) => (
            <div key={entry._id || idx} className="audit-entry">
              {/* Image */}
              <div
                className="audit-entry-image"
                onClick={() => entry.imageUrl && setSelectedImage(entry)}
              >
                {entry.imageUrl ? (
                  <img
                    src={entry.imageUrl}
                    alt={entry.originalFilename}
                    loading="lazy"
                  />
                ) : (
                  <div className="no-image">No Image</div>
                )}
              </div>

              {/* Details */}
              <div className="audit-entry-details">
                <div className="entry-filename" title={entry.originalFilename}>
                  {entry.originalFilename}
                </div>
                <div className="entry-meta">
                  <div className="meta-row">
                    <span className="meta-label">Bucket</span>
                    <span className="meta-value bucket-value">{entry.bucketName}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">IAM User</span>
                    <span className="meta-value iam-value">{entry.iamUsername || (entry.credentialType === 'default' ? 'admin (default)' : 'N/A')}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">S3 Key</span>
                    <span className="meta-value" title={entry.s3Key}>{entry.s3Key}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Time</span>
                    <span className="meta-value">{formatDate(entry.createdAt || entry.timestamp)}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">IP</span>
                    <span className="meta-value">{entry.ip}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Region</span>
                    <span className="meta-value">{entry.region}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Size</span>
                    <span className="meta-value">{formatSize(entry.fileSize)}</span>
                  </div>
                </div>
                <div className="entry-tags">
                  <span className={`entry-tag mode-${entry.analysisMode}`}>
                    {entry.analysisMode === 'face' ? 'Face' : 'Moderation'}
                  </span>
                  <span className={`entry-tag cred-${entry.credentialType}`}>
                    {entry.credentialType === 'custom' ? `Custom (${entry.accessKeyPrefix})` : 'Default'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Image Lightbox */}
      {selectedImage && (
        <div className="audit-lightbox" onClick={() => setSelectedImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setSelectedImage(null)}>×</button>
            <img
              src={selectedImage.imageUrl}
              alt={selectedImage.originalFilename}
            />
            <div className="lightbox-info">
              <h3>{selectedImage.originalFilename}</h3>
              <p>Bucket: <strong>{selectedImage.bucketName}</strong></p>
              <p>IAM User: <strong className="iam-highlight">{selectedImage.iamUsername || (selectedImage.credentialType === 'default' ? 'admin (default)' : 'N/A')}</strong></p>
              <p>Uploaded: {formatDate(selectedImage.createdAt || selectedImage.timestamp)} | IP: {selectedImage.ip}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditDashboard;
