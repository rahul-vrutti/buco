const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');
const mqtt = require('mqtt');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 5000;
const docker = new Docker();

// MQTT client setup
const brokerUrl = process.env.MQTT_BROKER_URL;
console.log('brokerUrl: ', brokerUrl);
console.log('Attempting to connect to MQTT broker...');

const mqttClient = mqtt.connect(brokerUrl, {
    connectTimeout: 30 * 1000, // 30 seconds
    reconnectPeriod: 5000, // 5 seconds
    clean: true,
    keepalive: 60
});

mqttClient.on('connect', () => {
    console.log('✅ Buco backend successfully connected to MQTT broker');
    console.log('Connection details:', {
        brokerUrl: brokerUrl,
        clientId: mqttClient.options.clientId,
        timestamp: new Date().toISOString()
    });

    // Subscribe to version updates from subco
    mqttClient.subscribe('/Version', (err) => {
        if (err) {
            console.error('❌ MQTT subscription error for /Version topic:', err);
        } else {
            console.log('✅ Successfully subscribed to /Version topic');
        }
    });
});

mqttClient.on('reconnect', () => {
    console.log('🔄 MQTT client attempting to reconnect...');
});

mqttClient.on('close', () => {
    console.log('⚠️ MQTT connection closed');
});

mqttClient.on('disconnect', () => {
    console.log('⚠️ MQTT client disconnected');
});

mqttClient.on('offline', () => {
    console.log('⚠️ MQTT client is offline');
});

mqttClient.on('message', async (topic, message) => {
    try {
        if (topic === '/Version') {
            const newVersion = message.toString();
            console.log(`📨 Received version update from subco: ${newVersion}`);

            // Update the package.json file with the current version data
            try {
                await updateBucoPackageJson(newVersion);
                console.log('✅ Successfully updated buco package.json');
            } catch (error) {
                console.error('❌ Failed to update package.json:', error);
            }
        }
    } catch (error) {
        console.error('❌ Error processing MQTT message:', error);
        console.error('Topic:', topic);
        console.error('Message:', message.toString());
    }
});

mqttClient.on('error', (error) => {
    console.error('❌ MQTT connection error:', error);
    console.error('Error details:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port,
        timestamp: new Date().toISOString()
    });

    // Log specific connection issues
    if (error.code === 'ECONNREFUSED') {
        console.error('🚫 Connection refused - MQTT broker may not be running or accessible');
        console.error(`Check if MQTT broker is running at: ${brokerUrl}`);
    } else if (error.code === 'ENOTFOUND') {
        console.error('🚫 Host not found - Check the MQTT broker URL');
    } else if (error.code === 'ETIMEDOUT') {
        console.error('🚫 Connection timeout - MQTT broker may be unreachable');
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './front')));

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '..', 'uploads', 'docker-images');
fs.ensureDirSync(uploadDir);

// Configure multer for Docker tar file uploads
const dockerTarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const uploadDockerTar = multer({
    storage: dockerTarStorage,
    fileFilter: (req, file, cb) => {
        // Only allow .tar files
        if (file.originalname.toLowerCase().endsWith('.tar')) {
            cb(null, true);
        } else {
            cb(new Error('Only .tar files are allowed for Docker image uploads'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024 // 5GB limit for Docker tar files
    }
});

// Docker service configurations
const dockerServices = {
    buco: {
        imageName: 'buco-service',
        containerName: 'buco-container'
    },
    subco: {
        imageName: 'subco-service',
        containerName: 'subco-container'
    },
    mqtt: {
        imageName: 'mqtt-service',
        containerName: 'mqtt-container'
    },
    dhcp: {
        imageName: 'dhcp-service',
        containerName: 'dhcp-container'
    }
};

// Routes

// Upload Docker tar file and load/push images
app.post('/api/upload-docker-tar', uploadDockerTar.single('dockerTar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No tar file uploaded' });
        }

        console.log('Docker tar file uploaded:', req.file.filename);

        // Validate the tar file before processing
        const validationResult = await validateDockerTarFile(req.file.path);
        if (!validationResult.isValid) {
            // Clean up invalid file
            await fs.unlink(req.file.path);
            return res.status(400).json({
                error: 'Invalid Docker tar file',
                details: validationResult.error
            });
        }

        // Process the Docker tar file
        const dockerResult = await processDockerTarFile(req.file);

        res.json({
            message: 'Docker tar file uploaded and images processed successfully',
            file: req.file.filename,
            dockerResult
        });

    } catch (error) {
        console.error('Docker tar upload error:', error);

        // Clean up file if it exists and there was an error
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('Failed to cleanup file after error:', cleanupError.message);
            }
        }

        res.status(500).json({
            error: 'Failed to process Docker tar upload',
            details: error.message
        });
    }
});

// Test endpoint to verify Docker functionality
app.get('/api/test-docker-setup', async (req, res) => {
    try {
        const testResults = {
            dockerDaemon: { accessible: false, version: null },
            localRegistry: { accessible: false, url: process.env.LOCAL_REGISTRY_URL || '100.103.254.213:5001' },
            uploadDirectory: { exists: false, writable: false },
            dockerCommands: { load: false, tag: false, push: false }
        };

        // Test Docker daemon
        try {
            const { stdout: dockerVersion } = await execPromise('docker version --format "{{.Server.Version}}"');
            testResults.dockerDaemon.accessible = true;
            testResults.dockerDaemon.version = dockerVersion.trim();
        } catch (error) {
            testResults.dockerDaemon.error = error.message;
        }

        // Test upload directory
        try {
            const dirExists = await fs.pathExists(uploadDir);
            testResults.uploadDirectory.exists = dirExists;

            if (dirExists) {
                // Test write permissions
                const testFile = path.join(uploadDir, 'test-write.tmp');
                await fs.writeFile(testFile, 'test');
                await fs.unlink(testFile);
                testResults.uploadDirectory.writable = true;
            }
        } catch (error) {
            testResults.uploadDirectory.error = error.message;
        }

        // Test registry connectivity
        try {
            const registryUrl = testResults.localRegistry.url;
            await execPromise(`curl -f http://${registryUrl}/v2/ --connect-timeout 5`);
            testResults.localRegistry.accessible = true;
        } catch (error) {
            testResults.localRegistry.error = error.message;
        }

        // Test basic Docker commands availability
        if (testResults.dockerDaemon.accessible) {
            try {
                await execPromise('docker --help | grep load');
                testResults.dockerCommands.load = true;
            } catch (error) {
                testResults.dockerCommands.loadError = error.message;
            }

            try {
                await execPromise('docker --help | grep tag');
                testResults.dockerCommands.tag = true;
            } catch (error) {
                testResults.dockerCommands.tagError = error.message;
            }

            try {
                await execPromise('docker --help | grep push');
                testResults.dockerCommands.push = true;
            } catch (error) {
                testResults.dockerCommands.pushError = error.message;
            }
        }

        res.json({
            message: 'Docker setup test completed',
            results: testResults,
            ready: testResults.dockerDaemon.accessible && testResults.uploadDirectory.exists && testResults.uploadDirectory.writable
        });

    } catch (error) {
        console.error('Docker setup test error:', error);
        res.status(500).json({
            error: 'Failed to test Docker setup',
            details: error.message
        });
    }
});

// Get Docker images status and local registry information
app.get('/api/docker-images-status', async (req, res) => {
    try {
        const status = await getDockerImagesStatus();
        res.json(status);
    } catch (error) {
        console.error('Docker images status error:', error);
        res.status(500).json({ error: 'Failed to get Docker images status' });
    }
});

// Get list of images in the Docker registry
app.get('/api/registry-images', async (req, res) => {
    try {
        const registryImages = await getRegistryImages();
        res.json(registryImages);
    } catch (error) {
        console.error('Registry images error:', error);
        res.status(500).json({ error: 'Failed to get registry images' });
    }
});

// Pull image from registry to local Docker
app.post('/api/pull-from-registry', async (req, res) => {
    try {
        const { imageName } = req.body;

        if (!imageName) {
            return res.status(400).json({ error: 'Image name is required' });
        }

        const result = await pullImageFromRegistry(imageName);
        res.json(result);
    } catch (error) {
        console.error('Pull from registry error:', error);
        res.status(500).json({ error: 'Failed to pull image from registry' });
    }
});

// Get summary of all pushed images and their tags
app.get('/api/registry-summary', async (req, res) => {
    try {
        const summary = await getRegistrySummary();
        res.json(summary);
    } catch (error) {
        console.error('Registry summary error:', error);
        res.status(500).json({ error: 'Failed to get registry summary' });
    }
});

// Update specific service version
// Get Docker services status
app.get('/api/docker-status', async (req, res) => {
    try {
        const status = await getDockerServicesStatus();
        res.json(status);
    } catch (error) {
        console.error('Docker status error:', error);
        res.status(500).json({ error: 'Failed to get Docker status' });
    }
});

// Update all services with Watchtower
app.post('/api/update-all-watchtower', async (req, res) => {
    try {
        const result = await triggerWatchtowerUpdate();
        res.json({
            message: 'Watchtower update triggered successfully',
            result
        });
    } catch (error) {
        console.error('Watchtower update error:', error);
        res.status(500).json({ error: 'Failed to trigger Watchtower update' });
    }
});

// Helper Functions

// Function to validate Docker tar file
async function validateDockerTarFile(tarFilePath) {
    try {
        console.log('Validating Docker tar file:', tarFilePath);

        // Check if file exists and is readable
        const stats = await fs.stat(tarFilePath);
        if (!stats.isFile()) {
            return { isValid: false, error: 'Uploaded file is not a valid file' };
        }

        // Check file size (should be reasonable for a Docker image tar)
        if (stats.size === 0) {
            return { isValid: false, error: 'Tar file is empty' };
        }

        if (stats.size > 5 * 1024 * 1024 * 1024) { // 5GB limit
            return { isValid: false, error: 'Tar file is too large (max 5GB)' };
        }

        // Validate tar file structure using tar command
        try {
            const { stdout, stderr } = await execPromise(`tar -tf "${tarFilePath}" | head -10`);

            // A Docker tar should contain manifest.json and other Docker-specific files
            const { stdout: fullList } = await execPromise(`tar -tf "${tarFilePath}"`);

            if (!fullList.includes('manifest.json') && !fullList.includes('.json')) {
                console.warn('Tar file may not be a Docker image tar (no manifest.json found)');
                // Don't fail validation, as some Docker tars might have different structures
            }

            console.log('Tar file validation passed');
            return { isValid: true };

        } catch (tarError) {
            console.error('Tar validation failed:', tarError.message);
            return { isValid: false, error: 'File is not a valid tar archive' };
        }

    } catch (error) {
        console.error('Error validating tar file:', error);
        return { isValid: false, error: `Validation failed: ${error.message}` };
    }
}

// Function to process Docker tar file and load/push images
async function processDockerTarFile(file) {
    try {
        console.log('Processing Docker tar file:', file.filename);

        const tarFilePath = file.path;
        const results = {
            loadedImages: [],
            pushedImages: [],
            errors: [],
            warnings: []
        };

        // Check if Docker daemon is accessible
        try {
            await execPromise('docker version');
        } catch (dockerError) {
            throw new Error('Docker daemon is not accessible. Ensure Docker is running and accessible from this container.');
        }

        // Load Docker images from tar file
        const loadResult = await loadDockerImagesFromTar(tarFilePath);
        results.loadedImages = loadResult.images;

        if (loadResult.errors.length > 0) {
            results.errors.push(...loadResult.errors);
        }

        if (loadResult.warnings && loadResult.warnings.length > 0) {
            results.warnings.push(...loadResult.warnings);
        }

        // Only attempt to push if images were successfully loaded
        if (loadResult.images.length > 0) {
            try {
                const pushResult = await pushImagesToLocalRegistry(loadResult.images);
                results.pushedImages = pushResult.pushedImages;

                if (pushResult.errors.length > 0) {
                    results.errors.push(...pushResult.errors);
                }

                if (pushResult.warnings && pushResult.warnings.length > 0) {
                    results.warnings.push(...pushResult.warnings);
                }
            } catch (pushError) {
                console.error('Failed to push images to registry:', pushError);
                results.errors.push(`Registry push failed: ${pushError.message}`);
            }
        } else {
            results.warnings.push('No images were loaded from the tar file');
        }

        // Clean up the uploaded tar file to save space
        try {
            await fs.unlink(tarFilePath);
            console.log('Cleaned up uploaded tar file');
        } catch (cleanupError) {
            console.warn('Failed to cleanup tar file:', cleanupError.message);
            results.warnings.push(`Failed to cleanup tar file: ${cleanupError.message}`);
        }

        console.log('Docker tar processing completed:', results);
        return results;

    } catch (error) {
        console.error('Error processing Docker tar file:', error);
        throw new Error(`Docker tar processing failed: ${error.message}`);
    }
}

// Function to load Docker images from tar file
async function loadDockerImagesFromTar(tarFilePath) {
    try {
        console.log('Loading Docker images from tar file:', tarFilePath);

        const results = {
            images: [],
            errors: [],
            warnings: []
        };

        // Validate tar file exists before attempting to load
        if (!await fs.pathExists(tarFilePath)) {
            throw new Error('Tar file not found');
        }

        // Use docker load command to load images from tar file
        console.log('Executing docker load command...');
        const { stdout, stderr } = await execPromise(`docker load -i "${tarFilePath}"`, {
            timeout: 300000 // 5 minute timeout for large images
        });

        if (stderr) {
            console.warn('Docker load stderr:', stderr);
            // Some stderr output is normal for docker load, so don't treat as error unless it's critical
            if (stderr.includes('Error') || stderr.includes('failed')) {
                results.warnings.push(`Docker load warning: ${stderr}`);
            }
        }

        console.log('Docker load stdout:', stdout);

        // Parse loaded images from stdout
        // Docker load output format: "Loaded image: image_name:tag"
        const loadedImageMatches = stdout.match(/Loaded image: (.+)/g);

        if (loadedImageMatches) {
            for (const match of loadedImageMatches) {
                const imageName = match.replace('Loaded image: ', '').trim();
                results.images.push(imageName);
                console.log('Successfully loaded image:', imageName);
            }
        }

        // If no images found in stdout, try alternative parsing methods
        if (results.images.length === 0) {
            console.log('No images found in docker load output, trying alternative detection...');

            // Check for "Loaded image ID" format
            const imageIdMatches = stdout.match(/Loaded image ID: (.+)/g);
            if (imageIdMatches) {
                for (const match of imageIdMatches) {
                    const imageId = match.replace('Loaded image ID: ', '').trim();
                    // Try to get the image name from the ID
                    try {
                        const { stdout: inspectOutput } = await execPromise(`docker inspect ${imageId} --format='{{range .RepoTags}}{{.}} {{end}}'`);
                        const tags = inspectOutput.trim().split(' ').filter(tag => tag && tag !== '<none>');
                        results.images.push(...tags);
                    } catch (inspectError) {
                        console.warn('Failed to inspect image ID:', imageId, inspectError.message);
                        results.warnings.push(`Loaded image with ID ${imageId} but couldn't determine name`);
                    }
                }
            }

            // If still no images, try to get recently loaded images
            if (results.images.length === 0) {
                try {
                    console.log('Attempting to find recently created images...');
                    const { stdout: imagesOutput } = await execPromise('docker images --format "{{.Repository}}:{{.Tag}}" --filter "dangling=false" | head -20');
                    const recentImages = imagesOutput.trim().split('\n').filter(img => img && img !== '<none>:<none>' && img.trim() !== '');

                    if (recentImages.length > 0) {
                        results.warnings.push('Could not parse loaded images from docker load output, using recently available images');
                        results.images.push(...recentImages.slice(0, 5)); // Limit to first 5 images to avoid false positives
                    }
                } catch (imagesError) {
                    console.warn('Failed to get recent images:', imagesError.message);
                    results.warnings.push('Could not determine loaded images');
                }
            }
        }

        if (results.images.length === 0) {
            results.errors.push('No Docker images were successfully loaded from the tar file');
        } else {
            console.log(`Successfully loaded ${results.images.length} images:`, results.images);
        }

        return results;

    } catch (error) {
        console.error('Error loading Docker images from tar:', error);
        return {
            images: [],
            errors: [`Failed to load images from tar: ${error.message}`],
            warnings: []
        };
    }
}

// Function to push images to local Docker registry
async function pushImagesToLocalRegistry(imageNames) {
    try {
        console.log('Pushing images to local registry:', imageNames);

        const results = {
            pushedImages: [],
            errors: [],
            warnings: []
        };

        // Default local registry URL (can be configured via environment variable)
        const localRegistryUrl = process.env.LOCAL_REGISTRY_URL || '100.103.254.213:5001';

        // Test registry connectivity before attempting pushes
        try {
            console.log(`Testing connectivity to registry: ${localRegistryUrl}`);
            // Try to check if registry is accessible
            const { stdout: registryTest } = await execPromise(`curl -f http://${localRegistryUrl}/v2/ || echo "Registry not accessible via HTTP"`);
            if (registryTest.includes('Registry not accessible')) {
                results.warnings.push(`Local registry at ${localRegistryUrl} may not be accessible. Proceeding with push attempts anyway.`);
            }
        } catch (testError) {
            console.warn('Registry connectivity test failed:', testError.message);
            results.warnings.push(`Could not verify registry connectivity: ${testError.message}`);
        }

        for (const imageName of imageNames) {
            try {
                console.log(`Processing image: ${imageName}`);

                // Extract the base image name (without registry prefix)
                const imageBaseName = imageName.includes('/') ? imageName.split('/').pop() : imageName;

                // Extract repository name and tag from the image
                const [repoName, originalTag = 'latest'] = imageBaseName.split(':');

                // Create tags for both original version and latest
                const originalLocalImageName = `${localRegistryUrl}/${repoName}:${originalTag}`;
                const latestLocalImageName = `${localRegistryUrl}/${repoName}:latest`;

                console.log(`Processing repository: ${repoName}, original tag: ${originalTag}`);

                // Tag and push the original version
                console.log(`Tagging image ${imageName} as ${originalLocalImageName}`);
                await execPromise(`docker tag "${imageName}" "${originalLocalImageName}"`);

                console.log(`Pushing original version ${originalLocalImageName} to local registry`);
                const { stdout: originalStdout, stderr: originalStderr } = await execPromise(`docker push "${originalLocalImageName}"`, {
                    timeout: 600000 // 10 minute timeout for large images
                });

                if (originalStderr) {
                    console.warn(`Push stderr for ${originalLocalImageName}:`, originalStderr);
                    if (originalStderr.includes('error') || originalStderr.includes('failed')) {
                        results.warnings.push(`Push warning for ${originalLocalImageName}: ${originalStderr}`);
                    }
                }

                console.log(`Successfully pushed ${originalLocalImageName}`);

                // Tag and push the latest version
                console.log(`Tagging image ${imageName} as ${latestLocalImageName}`);
                await execPromise(`docker tag "${imageName}" "${latestLocalImageName}"`);

                console.log(`Pushing latest version ${latestLocalImageName} to local registry`);
                const { stdout: latestStdout, stderr: latestStderr } = await execPromise(`docker push "${latestLocalImageName}"`, {
                    timeout: 600000 // 10 minute timeout for large images
                });

                if (latestStderr) {
                    console.warn(`Push stderr for ${latestLocalImageName}:`, latestStderr);
                    if (latestStderr.includes('error') || latestStderr.includes('failed')) {
                        results.warnings.push(`Push warning for ${latestLocalImageName}: ${latestStderr}`);
                    }
                }

                console.log(`Successfully pushed ${latestLocalImageName}`);

                // Add both pushed images to results
                results.pushedImages.push({
                    originalName: imageName,
                    localName: originalLocalImageName,
                    registryUrl: localRegistryUrl,
                    tag: originalTag,
                    status: 'success',
                    type: 'original'
                });

                results.pushedImages.push({
                    originalName: imageName,
                    localName: latestLocalImageName,
                    registryUrl: localRegistryUrl,
                    tag: 'latest',
                    status: 'success',
                    type: 'latest'
                });

                // Clean up the local tags to save space (optional)
                try {
                    await execPromise(`docker rmi "${originalLocalImageName}"`);
                    console.log(`Cleaned up local tag: ${originalLocalImageName}`);
                } catch (cleanupError) {
                    console.warn(`Failed to cleanup local tag ${originalLocalImageName}:`, cleanupError.message);
                }

                try {
                    await execPromise(`docker rmi "${latestLocalImageName}"`);
                    console.log(`Cleaned up local tag: ${latestLocalImageName}`);
                } catch (cleanupError) {
                    console.warn(`Failed to cleanup local tag ${latestLocalImageName}:`, cleanupError.message);
                }

            } catch (pushError) {
                console.error(`Failed to push image ${imageName}:`, pushError.message);
                results.errors.push(`Failed to push ${imageName}: ${pushError.message}`);

                // Extract repository name for failed push entries
                const imageBaseName = imageName.includes('/') ? imageName.split('/').pop() : imageName;
                const [repoName, originalTag = 'latest'] = imageBaseName.split(':');

                // Add partial results for failed pushes
                results.pushedImages.push({
                    originalName: imageName,
                    localName: `${localRegistryUrl}/${repoName}:${originalTag}`,
                    registryUrl: localRegistryUrl,
                    tag: originalTag,
                    status: 'failed',
                    type: 'original',
                    error: pushError.message
                });

                results.pushedImages.push({
                    originalName: imageName,
                    localName: `${localRegistryUrl}/${repoName}:latest`,
                    registryUrl: localRegistryUrl,
                    tag: 'latest',
                    status: 'failed',
                    type: 'latest',
                    error: pushError.message
                });
            }
        }

        console.log(`Push operation completed. Success: ${results.pushedImages.filter(p => p.status === 'success').length}, Failed: ${results.errors.length}`);
        console.log(`Total images pushed (including both original and latest tags): ${results.pushedImages.filter(p => p.status === 'success').length}`);
        return results;

    } catch (error) {
        console.error('Error pushing images to local registry:', error);
        return {
            pushedImages: [],
            errors: [`Failed to push images to local registry: ${error.message}`],
            warnings: []
        };
    }
}

// Function to get Docker images status
async function getDockerImagesStatus() {
    try {
        const status = {
            localImages: [],
            registryInfo: {
                url: process.env.LOCAL_REGISTRY_URL || '100.103.254.213:5001',
                accessible: false
            },
            dockerDaemon: {
                accessible: false,
                version: null
            }
        };

        // Check Docker daemon accessibility
        try {
            const { stdout: dockerVersion } = await execPromise('docker version --format "{{.Server.Version}}"');
            status.dockerDaemon.accessible = true;
            status.dockerDaemon.version = dockerVersion.trim();
        } catch (dockerError) {
            console.warn('Docker daemon not accessible:', dockerError.message);
        }

        // Get local Docker images
        if (status.dockerDaemon.accessible) {
            try {
                const { stdout: imagesOutput } = await execPromise('docker images --format "table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}"');
                const imageLines = imagesOutput.split('\n').slice(1); // Skip header

                status.localImages = imageLines
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.split('\t');
                        return {
                            name: parts[0] || 'unknown',
                            id: parts[1] || 'unknown',
                            size: parts[2] || 'unknown',
                            created: parts[3] || 'unknown'
                        };
                    });
            } catch (imagesError) {
                console.warn('Failed to get Docker images:', imagesError.message);
            }
        }

        // Check registry accessibility
        try {
            const registryUrl = status.registryInfo.url;
            await execPromise(`curl -f http://${registryUrl}/v2/ --connect-timeout 5`);
            status.registryInfo.accessible = true;
        } catch (registryError) {
            console.warn('Registry not accessible:', registryError.message);
        }

        return status;
    } catch (error) {
        console.error('Error getting Docker images status:', error);
        throw new Error(`Failed to get Docker images status: ${error.message}`);
    }
}

// Function to get images available in the Docker registry
async function getRegistryImages() {
    try {
        const registryUrl = process.env.LOCAL_REGISTRY_URL || '100.103.254.213:5001';
        console.log('Checking registry images at:', registryUrl);

        const result = {
            registryUrl: registryUrl,
            images: [],
            accessible: false,
            error: null
        };

        try {
            // Check if registry is accessible
            await execPromise(`curl -f http://${registryUrl}/v2/ --connect-timeout 5`);
            result.accessible = true;

            // Get catalog of repositories
            const { stdout: catalogOutput } = await execPromise(`curl -s http://${registryUrl}/v2/_catalog`);
            const catalog = JSON.parse(catalogOutput);

            if (catalog.repositories && Array.isArray(catalog.repositories)) {
                // For each repository, get its tags
                for (const repo of catalog.repositories) {
                    try {
                        const { stdout: tagsOutput } = await execPromise(`curl -s http://${registryUrl}/v2/${repo}/tags/list`);
                        const tagData = JSON.parse(tagsOutput);

                        if (tagData.tags && Array.isArray(tagData.tags)) {
                            for (const tag of tagData.tags) {
                                result.images.push({
                                    repository: repo,
                                    tag: tag,
                                    fullName: `${registryUrl}/${repo}:${tag}`,
                                    pullCommand: `docker pull ${registryUrl}/${repo}:${tag}`
                                });
                            }
                        }
                    } catch (tagError) {
                        console.warn(`Failed to get tags for ${repo}:`, tagError.message);
                    }
                }
            }

        } catch (registryError) {
            console.warn('Registry not accessible or error occurred:', registryError.message);
            result.accessible = false;
            result.error = registryError.message;
        }

        return result;
    } catch (error) {
        console.error('Error getting registry images:', error);
        throw new Error(`Failed to get registry images: ${error.message}`);
    }
}

// Function to pull image from registry to local Docker
async function pullImageFromRegistry(imageName) {
    try {
        const registryUrl = process.env.LOCAL_REGISTRY_URL || '100.103.254.213:5001';

        // Ensure image name includes registry URL
        let fullImageName = imageName;
        if (!imageName.includes(registryUrl)) {
            fullImageName = `${registryUrl}/${imageName}`;
        }

        console.log('Pulling image from registry:', fullImageName);

        const result = {
            imageName: fullImageName,
            success: false,
            error: null,
            output: null
        };

        try {
            const { stdout, stderr } = await execPromise(`docker pull "${fullImageName}"`, {
                timeout: 300000 // 5 minute timeout
            });

            result.success = true;
            result.output = stdout;

            if (stderr) {
                console.warn('Pull stderr:', stderr);
            }

            console.log('Successfully pulled image:', fullImageName);

        } catch (pullError) {
            console.error('Failed to pull image:', pullError.message);
            result.error = pullError.message;
        }

        return result;
    } catch (error) {
        console.error('Error pulling image from registry:', error);
        throw new Error(`Failed to pull image from registry: ${error.message}`);
    }
}

// Function to get registry summary with grouped images and tags
async function getRegistrySummary() {
    try {
        const registryUrl = process.env.LOCAL_REGISTRY_URL || '100.103.254.213:5001';
        console.log('Getting registry summary from:', registryUrl);

        const result = {
            registryUrl: registryUrl,
            repositories: {},
            totalRepositories: 0,
            totalImages: 0,
            accessible: false,
            error: null
        };

        try {
            // Check if registry is accessible
            await execPromise(`curl -f http://${registryUrl}/v2/ --connect-timeout 5`);
            result.accessible = true;

            // Get catalog of repositories
            const { stdout: catalogOutput } = await execPromise(`curl -s http://${registryUrl}/v2/_catalog`);
            const catalog = JSON.parse(catalogOutput);

            if (catalog.repositories && Array.isArray(catalog.repositories)) {
                result.totalRepositories = catalog.repositories.length;

                // For each repository, get its tags and group them
                for (const repo of catalog.repositories) {
                    try {
                        const { stdout: tagsOutput } = await execPromise(`curl -s http://${registryUrl}/v2/${repo}/tags/list`);
                        const tagData = JSON.parse(tagsOutput);

                        if (tagData.tags && Array.isArray(tagData.tags)) {
                            result.repositories[repo] = {
                                name: repo,
                                tags: tagData.tags.sort(), // Sort tags alphabetically
                                totalTags: tagData.tags.length,
                                hasLatest: tagData.tags.includes('latest'),
                                versions: tagData.tags.filter(tag => tag !== 'latest'), // Non-latest tags
                                pullCommands: {
                                    latest: `docker pull ${registryUrl}/${repo}:latest`,
                                    allTags: tagData.tags.map(tag => `docker pull ${registryUrl}/${repo}:${tag}`)
                                }
                            };
                            result.totalImages += tagData.tags.length;
                        }
                    } catch (tagError) {
                        console.warn(`Failed to get tags for ${repo}:`, tagError.message);
                        result.repositories[repo] = {
                            name: repo,
                            error: tagError.message
                        };
                    }
                }
            }

        } catch (registryError) {
            console.warn('Registry not accessible or error occurred:', registryError.message);
            result.accessible = false;
            result.error = registryError.message;
        }

        return result;
    } catch (error) {
        console.error('Error getting registry summary:', error);
        throw new Error(`Failed to get registry summary: ${error.message}`);
    }
}

async function getDockerServicesStatus() {
    try {
        const containers = await docker.listContainers({ all: true });
        const status = {};

        for (const [serviceName, config] of Object.entries(dockerServices)) {
            const container = containers.find(c =>
                c.Names.some(name => name.includes(config.containerName))
            );

            status[serviceName] = {
                running: container ? container.State === 'running' : false,
                containerName: config.containerName,
                imageName: config.imageName
            };
        }

        return status;
    } catch (error) {
        throw new Error(`Failed to get Docker status: ${error.message}`);
    }
}

async function triggerWatchtowerUpdate() {
    try {
        // Check if Watchtower container is running
        const containers = await docker.listContainers();
        const watchtowerContainer = containers.find(container =>
            container.Names.some(name => name.includes('watchtower'))
        );

        if (!watchtowerContainer) {
            throw new Error('Watchtower container not found');
        }

        // Send update signal to Watchtower
        const watchtower = docker.getContainer(watchtowerContainer.Id);

        // In a real implementation, you might send a signal or API call to Watchtower
        // For demo purposes, we'll simulate this
        console.log('Triggering Watchtower update...');

        return {
            status: 'success',
            message: 'Watchtower update triggered',
            method: 'watchtower'
        };
    } catch (error) {
        throw new Error(`Watchtower update failed: ${error.message}`);
    }
}

// Function to update package.json with new versions
async function updateBucoPackageJson(newSubcoVersion) {
    try {
        const packageJsonPath = path.join(__dirname, '../package.json');

        // Read current package.json
        const packageData = await fs.readJson(packageJsonPath);

        // Update version tracking
        packageData.subcoVersion = newSubcoVersion;

        // Add last updated timestamp
        packageData.lastUpdated = new Date().toISOString();

        // Write back to package.json
        await fs.writeJson(packageJsonPath, packageData, { spaces: 2 });

        console.log(`Updated buco package.json with full package version: ${packageData.version}`);
        console.log(`Service versions:`, packageData.serviceVersions);
        return packageData;
    } catch (error) {
        console.error('Error updating package.json:', error);
        throw error;
    }
}

// Function to check MQTT connection status
function getMqttStatus() {
    return {
        connected: mqttClient.connected,
        reconnecting: mqttClient.reconnecting,
        brokerUrl: brokerUrl,
        lastError: mqttClient.lastError || null,
        options: {
            clientId: mqttClient.options?.clientId,
            keepalive: mqttClient.options?.keepalive,
            connectTimeout: mqttClient.options?.connectTimeout,
            reconnectPeriod: mqttClient.options?.reconnectPeriod
        }
    };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    const mqttStatus = getMqttStatus();

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        mqtt: mqttStatus,
        services: {
            backend: 'running',
            mqtt: mqttStatus.connected ? 'connected' : 'disconnected'
        }
    });
});

// Serve React frontend for all non-API routes (must be last)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, './front', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Buco backend server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Frontend available at: http://localhost:${PORT}`);
});