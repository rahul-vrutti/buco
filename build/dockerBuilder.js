const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

class DockerBuilder {
    constructor() {
        this.registryUrl = '100.103.254.213:5001';
        this.bucoWorkDir = path.resolve(__dirname, '../build');
        this.subcoWorkDir = path.resolve(__dirname, '../../subco');
        this.platform = process.platform;
        this.isLinux = this.platform === 'linux';
        this.isWindows = this.platform === 'win32';

        console.log(`🖥️  Platform detected: ${this.platform}`);
    }

    /**
     * Execute shell command as a promise
     */
    executeCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            console.log(`🔧 Executing: ${command} ${args.join(' ')}`);

            // Platform-specific shell configuration
            const shellOptions = {
                stdio: 'pipe',
                shell: this.isWindows ? true : '/bin/bash',
                ...options
            };

            const process = spawn(command, args, shellOptions);

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                console.log(output.trim());
            });

            process.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                console.error(output.trim());
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
                }
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Check if Docker is running and accessible
     */
    async checkDockerStatus() {
        try {
            await this.executeCommand('docker', ['version'], { stdio: 'pipe' });
            console.log('✅ Docker is running and accessible');
            return true;
        } catch (error) {
            console.error('❌ Docker is not accessible:', error.message);
            throw new Error('Docker is not running or not accessible. Please ensure Docker is installed and running.');
        }
    }

    /**
     * Build Docker image for a service
     */
    async buildImage(serviceName, version, workDir) {
        try {
            console.log(`🏗️  Building Docker image for ${serviceName}:${version}`);
            console.log(`📁 Working directory: ${workDir}`);

            // Verify working directory exists
            if (!await fs.pathExists(workDir)) {
                throw new Error(`Working directory does not exist: ${workDir}`);
            }

            // Verify Dockerfile exists
            const dockerfilePath = path.join(workDir, 'Dockerfile');
            if (!await fs.pathExists(dockerfilePath)) {
                throw new Error(`Dockerfile not found in: ${dockerfilePath}`);
            }

            const imageName = `${serviceName}:${version}`;

            // Build the image
            await this.executeCommand('docker', [
                'build',
                '-t', imageName,
                '-t', `${serviceName}:latest`,
                '.'
            ], { cwd: workDir });

            console.log(`✅ Successfully built ${imageName}`);
            return imageName;
        } catch (error) {
            console.error(`❌ Failed to build ${serviceName}:${version}`, error);
            throw error;
        }
    }

    /**
     * Tag image for registry
     */
    async tagImageForRegistry(localImage, serviceName, version) {
        try {
            const registryImageVersioned = `${this.registryUrl}/${serviceName}:${version}`;
            const registryImageLatest = `${this.registryUrl}/${serviceName}:latest`;

            console.log(`🏷️  Tagging ${localImage} for registry`);

            // Tag with version
            await this.executeCommand('docker', [
                'tag', localImage, registryImageVersioned
            ]);

            // Tag as latest
            await this.executeCommand('docker', [
                'tag', localImage, registryImageLatest
            ]);

            console.log(`✅ Tagged ${localImage} as ${registryImageVersioned} and ${registryImageLatest}`);
            return { versioned: registryImageVersioned, latest: registryImageLatest };
        } catch (error) {
            console.error(`❌ Failed to tag ${localImage}`, error);
            throw error;
        }
    }

    /**
     * Push image to registry
     */
    async pushImageToRegistry(registryImage) {
        try {
            console.log(`🚀 Pushing ${registryImage} to registry`);

            await this.executeCommand('docker', [
                'push', registryImage
            ]);

            console.log(`✅ Successfully pushed ${registryImage}`);
        } catch (error) {
            // Platform-specific error guidance
            if (error.message.includes('server gave HTTP response to HTTPS client')) {
                console.error(`❌ Registry ${this.registryUrl} is using HTTP but Docker expects HTTPS`);

                if (this.isLinux) {
                    console.error(`💡 To fix this on Linux:`);
                    console.error(`   1. Edit /etc/docker/daemon.json (as root):`);
                    console.error(`   {`);
                    console.error(`     "insecure-registries": ["${this.registryUrl}"]`);
                    console.error(`   }`);
                    console.error(`   2. sudo systemctl restart docker`);
                    console.error(`   3. Or run: sudo ./configure-docker-registry.sh`);
                } else if (this.isWindows) {
                    console.error(`💡 To fix this on Windows:`);
                    console.error(`   Add "${this.registryUrl}" to Docker Desktop insecure registries`);
                    console.error(`   Settings > Docker Engine > insecure-registries`);
                } else {
                    console.error(`💡 Add "${this.registryUrl}" to Docker daemon's insecure registries`);
                }
            }
            console.error(`❌ Failed to push ${registryImage}`, error);
            throw error;
        }
    }    /**
     * Build and push buco service
     */
    async buildAndPushBuco(version) {
        try {
            console.log(`\n🚀 Starting buco build and push process for version ${version}`);

            // Check Docker status
            await this.checkDockerStatus();

            // Build the image
            const imageName = await this.buildImage('buco', version, this.bucoWorkDir);

            // Tag for registry
            const { versioned, latest } = await this.tagImageForRegistry(imageName, 'buco', version);

            // Push both tagged images
            await this.pushImageToRegistry(versioned);
            await this.pushImageToRegistry(latest);

            console.log(`✅ Successfully completed buco build and push for version ${version}`);
            return {
                success: true,
                service: 'buco',
                version: version,
                images: { versioned, latest }
            };
        } catch (error) {
            console.error(`❌ Failed to build and push buco:${version}`, error);
            throw error;
        }
    }

    /**
     * Build and push subco service
     */
    async buildAndPushSubco(version) {
        try {
            console.log(`\n🚀 Starting subco build and push process for version ${version}`);

            // Check Docker status
            await this.checkDockerStatus();

            // Build the image
            const imageName = await this.buildImage('subco', version, this.subcoWorkDir);

            // Tag for registry
            const { versioned, latest } = await this.tagImageForRegistry(imageName, 'subco', version);

            // Push both tagged images
            await this.pushImageToRegistry(versioned);
            await this.pushImageToRegistry(latest);

            console.log(`✅ Successfully completed subco build and push for version ${version}`);
            return {
                success: true,
                service: 'subco',
                version: version,
                images: { versioned, latest }
            };
        } catch (error) {
            console.error(`❌ Failed to build and push subco:${version}`, error);
            throw error;
        }
    }

    /**
     * Build and push both services
     */
    async buildAndPushAll(versions) {
        try {
            console.log('\n🔄 Starting build and push process for all services');
            console.log('Versions:', versions);

            const results = [];
            const errors = [];

            // Build and push buco (continue even if it fails)
            if (versions.bucoVersion || versions.fullPackageVersion) {
                const bucoVersion = versions.bucoVersion || versions.fullPackageVersion;
                try {
                    const bucoResult = await this.buildAndPushBuco(bucoVersion);
                    results.push(bucoResult);
                } catch (bucoError) {
                    console.error(`❌ Buco build failed, but continuing with subco...`);
                    errors.push({
                        service: 'buco',
                        version: bucoVersion,
                        error: bucoError.message
                    });
                }
            }

            // Build and push subco (regardless of buco result)
            if (versions.subcoVersion) {
                try {
                    const subcoResult = await this.buildAndPushSubco(versions.subcoVersion);
                    results.push(subcoResult);
                } catch (subcoError) {
                    console.error(`❌ Subco build failed`);
                    errors.push({
                        service: 'subco',
                        version: versions.subcoVersion,
                        error: subcoError.message
                    });
                }
            }

            const success = results.length > 0;
            if (success) {
                console.log('\n✅ Some or all services built successfully');
            } else {
                console.log('\n❌ All service builds failed');
            }

            return {
                success: success,
                results: results,
                errors: errors,
                registry: this.registryUrl,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Unexpected error in buildAndPushAll', error);
            return {
                success: false,
                results: [],
                errors: [{ service: 'unknown', error: error.message }],
                registry: this.registryUrl,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get registry status and available images
     */
    async getRegistryStatus() {
        try {
            // Try to list images in registry (this will work if registry supports catalog API)
            console.log(`📋 Checking registry status: ${this.registryUrl}`);

            // List local images that are tagged for this registry
            const { stdout } = await this.executeCommand('docker', [
                'images', '--format', 'table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}',
                '--filter', `reference=${this.registryUrl}/*`
            ]);

            console.log('🐳 Local images tagged for registry:');
            console.log(stdout || 'No images found');

            return {
                registry: this.registryUrl,
                localImages: stdout,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Failed to get registry status', error);
            throw error;
        }
    }
}

module.exports = DockerBuilder;