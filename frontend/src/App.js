import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
    const [dockerTarFile, setDockerTarFile] = useState(null);
    const [uploadingDockerTar, setUploadingDockerTar] = useState(false);
    const [dockerMessage, setDockerMessage] = useState('');
    const [dockerImagesStatus, setDockerImagesStatus] = useState(null);

    useEffect(() => {
        fetchDockerImagesStatus();
    }, []);

    const fetchDockerImagesStatus = async () => {
        try {
            const response = await axios.get('/api/docker-images-status');
            setDockerImagesStatus(response.data);
        } catch (error) {
            console.error('Error fetching Docker images status:', error);
        }
    };

    const handleDockerTarFileChange = (event) => {
        setDockerTarFile(event.target.files[0]);
        setDockerMessage('');
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

    return (
        <div className="App">
            <header className="App-header">
                <h1>🚀 Buco Package Version Manager</h1>
                <p>Upload Docker images to update all services</p>
            </header>

            <main className="App-main">
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
            </main>
        </div>
    );
}

export default App;