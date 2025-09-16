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
    const [dockerTarFile, setDockerTarFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadingDockerTar, setUploadingDockerTar] = useState(false);
    const [message, setMessage] = useState('');
    const [dockerMessage, setDockerMessage] = useState('');
    const [updateMethod, setUpdateMethod] = useState('docker');
    const [dockerImagesStatus, setDockerImagesStatus] = useState(null);

    useEffect(() => {
        fetchVersions();
        fetchDockerStatus();
        fetchDockerImagesStatus();
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

    const fetchDockerImagesStatus = async () => {
        try {
            const response = await axios.get('/api/docker-images-status');
            setDockerImagesStatus(response.data);
        } catch (error) {
            console.error('Error fetching Docker images status:', error);
        }
    };

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
        setMessage('');
    };

    const handleDockerTarFileChange = (event) => {
        setDockerTarFile(event.target.files[0]);
        setDockerMessage('');
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

    const handleDockerTarUpload = async () => {
        if (!dockerTarFile) {
            setDockerMessage('Please select a Docker tar file to upload');
            return;
        }

        if (!dockerTarFile.name.toLowerCase().endsWith('.tar')) {
            setDockerMessage('Please select a .tar file');
            return;
        }

        setUploadingDockerTar(true);
        setDockerMessage('');

        try {
            const formData = new FormData();
            formData.append('dockerTar', dockerTarFile);

            const response = await axios.post('/api/upload-docker-tar', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const result = response.data;
            let message = `Success: ${result.message}`;

            if (result.dockerResult) {
                const { loadedImages, pushedImages, errors, warnings } = result.dockerResult;

                message += `\nLoaded ${loadedImages.length} images`;
                if (pushedImages.length > 0) {
                    message += `, pushed ${pushedImages.filter(p => p.status === 'success').length} to registry`;
                }

                if (errors.length > 0) {
                    message += `\nErrors: ${errors.join(', ')}`;
                }

                if (warnings && warnings.length > 0) {
                    message += `\nWarnings: ${warnings.join(', ')}`;
                }
            }

            setDockerMessage(message);
            setDockerTarFile(null);
            document.getElementById('dockerTarInput').value = '';
            fetchDockerImagesStatus();
        } catch (error) {
            setDockerMessage(`Error: ${error.response?.data?.error || 'Docker tar upload failed'}`);
        } finally {
            setUploadingDockerTar(false);
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

                {/* Docker Tar Upload Section */}
                <section className="upload-section">
                    <h2>🐳 Docker Images Upload</h2>
                    <p>Upload a .tar file containing Docker images to load and push to local registry</p>
                    <div className="upload-container">
                        <input
                            id="dockerTarInput"
                            type="file"
                            accept=".tar"
                            onChange={handleDockerTarFileChange}
                            disabled={uploadingDockerTar}
                            className="file-input"
                        />
                        <button
                            onClick={handleDockerTarUpload}
                            disabled={uploadingDockerTar || !dockerTarFile}
                            className="upload-button docker-upload"
                        >
                            {uploadingDockerTar ? 'Processing...' : 'Upload & Load Docker Images'}
                        </button>
                    </div>

                    {dockerImagesStatus && (
                        <div className="docker-status">
                            <h4>Docker Status:</h4>
                            <p>Docker Daemon: {dockerImagesStatus.dockerDaemon.accessible ?
                                `✅ Connected (v${dockerImagesStatus.dockerDaemon.version})` :
                                '❌ Not accessible'}
                            </p>
                            <p>Local Registry: {dockerImagesStatus.registryInfo.accessible ?
                                `✅ Connected (${dockerImagesStatus.registryInfo.url})` :
                                `❌ Not accessible (${dockerImagesStatus.registryInfo.url})`}
                            </p>
                            <p>Local Images: {dockerImagesStatus.localImages.length} images available</p>
                        </div>
                    )}

                    {dockerMessage && (
                        <div className={`message ${dockerMessage.startsWith('Error') ? 'error' : 'success'}`}>
                            <pre>{dockerMessage}</pre>
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