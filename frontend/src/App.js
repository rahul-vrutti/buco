import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
    const [versions, setVersions] = useState({
        fullPackageVersion: '2.0.0',
        bucoVersion: '1.2.3',
        subcoVersion: '1.1.0',
        mqttVersion: '1.0.5',
        dhcpVersion: '1.0.2',
        lastUpdated: new Date().toISOString()
    });

    const [dockerStatus, setDockerStatus] = useState({});
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState('');
    const [updateMethod, setUpdateMethod] = useState('docker');

    useEffect(() => {
        fetchVersions();
        fetchDockerStatus();
    }, []);

    const fetchVersions = async () => {
        try {
            const response = await axios.get('/api/versions');
            setVersions(response.data);
        } catch (error) {
            console.error('Error fetching versions:', error);
            setMessage('Error fetching version data');
        }
    };

    const fetchDockerStatus = async () => {
        try {
            const response = await axios.get('/api/docker-status');
            setDockerStatus(response.data);
        } catch (error) {
            console.error('Error fetching Docker status:', error);
        }
    };

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
        setMessage('');
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage('Please select a file to upload');
            return;
        }

        setUploading(true);
        setMessage('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            setMessage(`Success: ${response.data.message}`);
            setVersions(response.data.newVersions);
            setFile(null);
            document.getElementById('fileInput').value = '';
            fetchDockerStatus();
        } catch (error) {
            setMessage(`Error: ${error.response?.data?.error || 'Upload failed'}`);
        } finally {
            setUploading(false);
        }
    };

    const handleUpdateService = async (serviceName) => {
        try {
            const newVersion = prompt(`Enter new version for ${serviceName}:`);
            if (!newVersion) return;

            setMessage('Updating service...');

            const response = await axios.post(`/api/update-service/${serviceName}`, {
                version: newVersion,
                updateMethod
            });

            setMessage(`Success: ${response.data.message}`);
            setVersions(response.data.newVersions);
            fetchDockerStatus();
        } catch (error) {
            setMessage(`Error: ${error.response?.data?.error || 'Service update failed'}`);
        }
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>🚀 Buco Package Version Manager</h1>
                <p>Upload files to update all services</p>
            </header>

            <main className="App-main">
                {/* File Upload Section */}
                <section className="upload-section">
                    <h2>📁 File Upload</h2>
                    <div className="upload-container">
                        <input
                            id="fileInput"
                            type="file"
                            onChange={handleFileChange}
                            disabled={uploading}
                            className="file-input"
                        />
                        <button
                            onClick={handleUpload}
                            disabled={uploading || !file}
                            className="upload-button"
                        >
                            {uploading ? 'Uploading...' : 'Upload & Update Services'}
                        </button>
                    </div>

                    <div className="update-method">
                        <label>
                            <input
                                type="radio"
                                value="docker"
                                checked={updateMethod === 'docker'}
                                onChange={(e) => setUpdateMethod(e.target.value)}
                            />
                            Docker Local Repository
                        </label>
                    </div>

                    {message && (
                        <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`}>
                            {message}
                        </div>
                    )}
                </section>

                {/* Version Display Section */}
                <section className="version-section">
                    <h2>📋 Package Versions</h2>

                    <div className="full-version">
                        <h3>Full Package Version: <span className="version-number">{versions.fullPackageVersion}</span></h3>
                        <p className="last-updated">Last Updated: {new Date(versions.lastUpdated).toLocaleString()}</p>
                    </div>

                    <div className="service-versions">
                        <div className="service-card">
                            <h4>🔧 Buco Service</h4>
                            <div className="version-info">
                                <span className="version">v{versions.bucoVersion}</span>
                                <span className={`status ${dockerStatus.buco?.running ? 'running' : 'stopped'}`}>
                                    {dockerStatus.buco?.running ? '🟢 Running' : '🔴 Stopped'}
                                </span>
                            </div>
                            <button onClick={() => handleUpdateService('buco')} className="update-btn">
                                Update Buco
                            </button>
                        </div>

                        <div className="service-card">
                            <h4>📦 Subco Service</h4>
                            <div className="version-info">
                                <span className="version">v{versions.subcoVersion}</span>
                                <span className={`status ${dockerStatus.subco?.running ? 'running' : 'stopped'}`}>
                                    {dockerStatus.subco?.running ? '🟢 Running' : '🔴 Stopped'}
                                </span>
                            </div>
                            <button onClick={() => handleUpdateService('subco')} className="update-btn">
                                Update Subco
                            </button>
                        </div>

                        <div className="service-card">
                            <h4>📡 MQTT Service</h4>
                            <div className="version-info">
                                <span className="version">v{versions.mqttVersion}</span>
                                <span className={`status ${dockerStatus.mqtt?.running ? 'running' : 'stopped'}`}>
                                    {dockerStatus.mqtt?.running ? '🟢 Running' : '🔴 Stopped'}
                                </span>
                            </div>
                            <button onClick={() => handleUpdateService('mqtt')} className="update-btn">
                                Update MQTT
                            </button>
                        </div>

                        <div className="service-card">
                            <h4>🌐 DHCP Service</h4>
                            <div className="version-info">
                                <span className="version">v{versions.dhcpVersion}</span>
                                <span className={`status ${dockerStatus.dhcp?.running ? 'running' : 'stopped'}`}>
                                    {dockerStatus.dhcp?.running ? '🟢 Running' : '🔴 Stopped'}
                                </span>
                            </div>
                            <button onClick={() => handleUpdateService('dhcp')} className="update-btn">
                                Update DHCP
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;