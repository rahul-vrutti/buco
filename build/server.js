const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');
const axios = require('axios');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 5000;
const docker = new Docker();

// MQTT client setup
const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://host.docker.internal:1883';
console.log('brokerUrl: ', brokerUrl);
const mqttClient = mqtt.connect(brokerUrl);

mqttClient.on('connect', () => {
    console.log('Buco backend connected to MQTT broker');
    // Subscribe to version updates from subco
    mqttClient.subscribe('/Version', (err) => {
        if (err) {
            console.error('MQTT subscription error:', err);
        } else {
            console.log('Subscribed to /Version topic');
        }
    });
});

mqttClient.on('message', async (topic, message) => {
    if (topic === '/Version') {
        const newVersion = message.toString();
        console.log(`Received version update from subco: ${newVersion}`);

        // Update subco version in our version data
        versionData.subcoVersion = newVersion;
        versionData.lastUpdated = new Date().toISOString();

        // Update the package.json file with the current version data
        // This should preserve the fullPackageVersion that was set from the file upload
        try {
            await updateBucoPackageJson(newVersion);
            console.log('Successfully updated buco package.json');
        } catch (error) {
            console.error('Failed to update package.json:', error);
        }
    }
});

mqttClient.on('error', (error) => {
    console.error('MQTT error:', error);
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

        // Send file information AND version data to subco via MQTT
        const fileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            uploadTime: new Date().toISOString(),
            versions: updateResult.newVersions // Include parsed versions
        };

        // Publish to /newUpdate topic
        mqttClient.publish('/newUpdate', JSON.stringify(fileInfo), (err) => {
            if (err) {
                console.error('Failed to publish file update via MQTT:', err);
            } else {
                console.log('File update sent to subco via MQTT:', fileInfo.filename);
                console.log('Versions sent:', fileInfo.versions);
            }
        });

        res.json({
            message: 'File uploaded and services updated successfully',
            file: req.file.filename,
            updateResult,
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

        // Update Docker services
        const updateResults = [];
        for (const serviceName of Object.keys(dockerServices)) {
            try {
                const result = await updateDockerService(serviceName, newVersions[`${serviceName}Version`]);
                updateResults.push({ service: serviceName, result });
            } catch (error) {
                console.error(`Failed to update ${serviceName}:`, error);
                updateResults.push({ service: serviceName, error: error.message });
            }
        }

        return {
            message: 'Services updated',
            updateResults,
            newVersions: versionData  // Return the updated versionData instead of parsed newVersions
        };
    } catch (error) {
        throw new Error(`File processing failed: ${error.message}`);
    }
}

async function updateServiceVersion(serviceName, version, updateMethod = 'docker') {
    try {
        // Update version in memory
        versionData[`${serviceName}Version`] = version;
        versionData.lastUpdated = new Date().toISOString();

        if (updateMethod === 'watchtower') {
            return await triggerWatchtowerUpdate();
        } else {
            return await updateDockerService(serviceName, version);
        }
    } catch (error) {
        throw new Error(`Service update failed: ${error.message}`);
    }
}

async function updateDockerService(serviceName, version) {
    try {
        const serviceConfig = dockerServices[serviceName];
        if (!serviceConfig) {
            throw new Error(`Unknown service: ${serviceName}`);
        }

        // Check if container exists
        const containers = await docker.listContainers({ all: true });
        const existingContainer = containers.find(container =>
            container.Names.some(name => name.includes(serviceConfig.containerName))
        );

        if (existingContainer) {
            // Stop and remove existing container
            const container = docker.getContainer(existingContainer.Id);
            await container.stop();
            await container.remove();
            console.log(`Stopped and removed container: ${serviceConfig.containerName}`);
        }

        // Pull new image with version tag
        const imageName = `${serviceConfig.imageName}:${version}`;
        console.log(`Pulling image: ${imageName}`);

        // Note: In a real implementation, you would actually pull and start the container
        // For demo purposes, we'll simulate this

        return {
            status: 'success',
            message: `Updated ${serviceName} to version ${version}`,
            imageName,
            method: 'docker-local'
        };
    } catch (error) {
        throw new Error(`Docker service update failed: ${error.message}`);
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
                version: versionData[`${serviceName}Version`],
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

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: versionData.fullPackageVersion
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