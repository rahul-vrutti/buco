const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const mqtt = require('mqtt');
const DockerBuilder = require('./dockerBuilder');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Docker builder
const dockerBuilder = new DockerBuilder();

// MQTT client setup
const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
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

            // Update subco version in our version data
            versionData.subcoVersion = newVersion;
            versionData.lastUpdated = new Date().toISOString();

            // Update the package.json file with the current version data
            // This should preserve the fullPackageVersion that was set from the file upload
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

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Version tracking
let versionData = {
    fullPackageVersion: "2.0.0",
    bucoVersion: "1.2.3",
    subcoVersion: "1.1.0",
    mqttVersion: "1.0.5",
    dhcpVersion: "1.0.2",
    lastUpdated: new Date().toISOString()
};

// Routes

// Get current version information
app.get('/api/versions', (req, res) => {
    res.json(versionData);
});

// Upload file and trigger updates
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('File uploaded:', req.file.filename);

        // Process the uploaded file and parse versions first
        const updateResult = await processFileAndUpdateServices(req.file);

        // Build and push Docker images with new versions
        let dockerResult = null;
        try {
            console.log('\n🐳 Starting Docker build and push process...');
            dockerResult = await dockerBuilder.buildAndPushAll(updateResult.newVersions);
            console.log('✅ Docker build and push completed successfully');
        } catch (dockerError) {
            console.error('❌ Docker build and push failed:', dockerError);
            // Continue with MQTT notification even if Docker fails
            dockerResult = {
                success: false,
                error: dockerError.message,
                timestamp: new Date().toISOString()
            };
        }

        // Send file information AND version data to subco via MQTT
        const fileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadTime: new Date().toISOString(),
            versions: updateResult.newVersions, // Include parsed versions
            dockerResult: dockerResult // Include Docker build results
        };

        // Publish to /newUpdate topic
        mqttClient.publish('/newUpdate', JSON.stringify(fileInfo), (err) => {
            if (err) {
                console.error('Failed to publish file update via MQTT:', err);
            } else {
                console.log('File update sent to subco via MQTT:', fileInfo.filename);
                console.log('Versions sent:', fileInfo.versions);
                console.log('Docker result sent:', dockerResult?.success ? 'SUCCESS' : 'FAILED');
            }
        });

        res.json({
            message: 'File uploaded and services updated successfully',
            file: req.file.filename,
            updateResult,
            dockerResult,
            newVersions: versionData
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to process upload' });
    }
});

// Update specific service version
app.post('/api/update-service/:serviceName', async (req, res) => {
    try {
        const { serviceName } = req.params;
        const { version, updateMethod } = req.body;

        if (!['buco', 'subco', 'mqtt', 'dhcp'].includes(serviceName)) {
            return res.status(400).json({ error: 'Invalid service name' });
        }

        const result = await updateServiceVersion(serviceName, version, updateMethod);

        res.json({
            message: `${serviceName} service updated successfully`,
            result,
            newVersions: versionData
        });
    } catch (error) {
        console.error('Service update error:', error);
        res.status(500).json({ error: 'Failed to update service' });
    }
});

// Manual Docker build and push endpoint
app.post('/api/docker/build-and-push', async (req, res) => {
    try {
        const { versions } = req.body;

        if (!versions) {
            return res.status(400).json({ error: 'Versions object is required' });
        }

        console.log('Manual Docker build and push triggered with versions:', versions);

        const dockerResult = await dockerBuilder.buildAndPushAll(versions);

        res.json({
            message: 'Docker build and push completed successfully',
            result: dockerResult
        });
    } catch (error) {
        console.error('Manual Docker build error:', error);
        res.status(500).json({
            error: 'Failed to build and push Docker images',
            details: error.message
        });
    }
});

// Get Docker registry status
app.get('/api/docker/registry-status', async (req, res) => {
    try {
        const registryStatus = await dockerBuilder.getRegistryStatus();

        res.json({
            message: 'Registry status retrieved successfully',
            status: registryStatus
        });
    } catch (error) {
        console.error('Registry status error:', error);
        res.status(500).json({
            error: 'Failed to get registry status',
            details: error.message
        });
    }
});

// Helper Functions

// Function to parse version file
async function parseVersionFile(filePath) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        console.log('Version file content:', fileContent);

        const versions = {};
        const lines = fileContent.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                // Support formats like "buco=1.2.3" or "buco: 1.2.3" or "buco 1.2.3"
                // Also support "fullPackage", "full", "package", "fullPackageVersion"
                const match = trimmedLine.match(/^(buco|subco|mqtt|dhcp|fullpackage|full|package|fullpackageversion)[\s:=]+(.+)$/i);
                if (match) {
                    const serviceName = match[1].toLowerCase();
                    const version = match[2].trim();

                    // Handle different names for full package version
                    if (['fullpackage', 'full', 'package', 'fullpackageversion'].includes(serviceName)) {
                        versions['fullPackageVersion'] = version;
                        console.log(`Parsed full package version: ${version}`);
                    } else {
                        versions[`${serviceName}Version`] = version;
                        console.log(`Parsed ${serviceName} version: ${version}`);
                    }
                }
            }
        }

        return versions;
    } catch (error) {
        console.error('Error parsing version file:', error);
        throw new Error(`Failed to parse version file: ${error.message}`);
    }
}

async function processFileAndUpdateServices(file) {
    try {
        console.log('Processing file:', file.filename);

        let newVersions;

        // Check if this is a version file (by extension or content)
        if (file.originalname.toLowerCase().includes('version') ||
            file.originalname.toLowerCase().endsWith('.txt') ||
            file.originalname.toLowerCase().endsWith('.conf')) {

            // Try to parse as version file
            try {
                newVersions = await parseVersionFile(file.path);

                // If we successfully parsed versions, use them
                if (Object.keys(newVersions).length > 0) {
                    console.log('Using versions from file:', newVersions);

                    // Ensure we have default values for any missing service versions
                    const completeVersions = {
                        bucoVersion: newVersions.bucoVersion || versionData.bucoVersion,
                        subcoVersion: newVersions.subcoVersion || versionData.subcoVersion,
                        mqttVersion: newVersions.mqttVersion || versionData.mqttVersion,
                        dhcpVersion: newVersions.dhcpVersion || versionData.dhcpVersion
                    };

                    // Include fullPackageVersion if it was parsed from the file
                    if (newVersions.fullPackageVersion) {
                        completeVersions.fullPackageVersion = newVersions.fullPackageVersion;
                    }

                    newVersions = completeVersions;
                } else {
                    // Fallback to increment logic
                    console.log('No valid versions found in file, using increment logic');
                    newVersions = {
                        bucoVersion: incrementVersion(versionData.bucoVersion),
                        subcoVersion: incrementVersion(versionData.subcoVersion),
                        mqttVersion: incrementVersion(versionData.mqttVersion),
                        dhcpVersion: incrementVersion(versionData.dhcpVersion)
                    };
                }
            } catch (parseError) {
                console.log('Failed to parse as version file, using increment logic');
                newVersions = {
                    bucoVersion: incrementVersion(versionData.bucoVersion),
                    subcoVersion: incrementVersion(versionData.subcoVersion),
                    mqttVersion: incrementVersion(versionData.mqttVersion),
                    dhcpVersion: incrementVersion(versionData.dhcpVersion)
                };
            }
        } else {
            // For non-version files, use increment logic
            console.log('File is not a version file, using increment logic');
            newVersions = {
                bucoVersion: incrementVersion(versionData.bucoVersion),
                subcoVersion: incrementVersion(versionData.subcoVersion),
                mqttVersion: incrementVersion(versionData.mqttVersion),
                dhcpVersion: incrementVersion(versionData.dhcpVersion)
            };
        }

        console.log('Final versions to apply:', newVersions);

        // Update version data
        const updatedVersionData = {
            ...versionData,
            bucoVersion: newVersions.bucoVersion,
            subcoVersion: newVersions.subcoVersion,
            mqttVersion: newVersions.mqttVersion,
            dhcpVersion: newVersions.dhcpVersion,
            lastUpdated: new Date().toISOString()
        };

        // Use full package version from file if provided, otherwise increment
        if (newVersions.fullPackageVersion) {
            updatedVersionData.fullPackageVersion = newVersions.fullPackageVersion;
            console.log(`Using full package version from file: ${newVersions.fullPackageVersion}`);
        } else {
            updatedVersionData.fullPackageVersion = incrementVersion(versionData.fullPackageVersion);
            console.log(`Auto-incremented full package version: ${updatedVersionData.fullPackageVersion}`);
        }

        versionData = updatedVersionData;

        console.log('Updated versionData:', versionData);

        return {
            message: 'Services updated',
            newVersions: versionData  // Return the updated versionData
        };
    } catch (error) {
        throw new Error(`File processing failed: ${error.message}`);
    }
}

async function updateServiceVersion(serviceName, version, updateMethod = 'mqtt') {
    try {
        // Update version in memory
        versionData[`${serviceName}Version`] = version;
        versionData.lastUpdated = new Date().toISOString();

        return {
            status: 'success',
            message: `Updated ${serviceName} to version ${version}`,
            method: 'version-tracking'
        };
    } catch (error) {
        throw new Error(`Service update failed: ${error.message}`);
    }
}

function incrementVersion(version) {
    const parts = version.split('.');
    parts[2] = String(parseInt(parts[2]) + 1);
    return parts.join('.');
}

// Function to update package.json with new versions
async function updateBucoPackageJson(newSubcoVersion) {
    try {
        const packageJsonPath = path.join(__dirname, '../package.json');

        // Read current package.json
        const packageData = await fs.readJson(packageJsonPath);

        // Update version tracking
        packageData.subcoVersion = newSubcoVersion;

        // Update main package version with the current full package version
        packageData.version = versionData.fullPackageVersion;

        // Add all service versions to package.json for tracking
        packageData.serviceVersions = {
            buco: versionData.bucoVersion,
            subco: versionData.subcoVersion,
            mqtt: versionData.mqttVersion,
            dhcp: versionData.dhcpVersion
        };

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
app.get('/api/health', async (req, res) => {
    const mqttStatus = getMqttStatus();

    // Check Docker status
    let dockerStatus = { available: false, error: null };
    try {
        await dockerBuilder.checkDockerStatus();
        dockerStatus.available = true;
    } catch (error) {
        dockerStatus.error = error.message;
    }

    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: versionData.fullPackageVersion,
        mqtt: mqttStatus,
        docker: dockerStatus,
        registry: dockerBuilder.registryUrl,
        services: {
            backend: 'running',
            mqtt: mqttStatus.connected ? 'connected' : 'disconnected',
            docker: dockerStatus.available ? 'available' : 'unavailable'
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