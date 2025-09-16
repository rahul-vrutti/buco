const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

class DockerBuildManager {
    constructor() {
        this.scriptPath = path.join(__dirname, 'scripts', 'docker-build-push.sh');
        this.buildInProgress = false;
    }

    async buildAndPushImages(versions, uploadedFilePath = null) {
        if (this.buildInProgress) {
            throw new Error('Build process is already in progress');
        }

        this.buildInProgress = true;

        try {
            console.log('🚀 Starting Docker build and push process...');
            console.log('Versions:', versions);

            const args = [];

            if (versions.bucoVersion) {
                args.push('--buco-version', versions.bucoVersion);
            }

            if (versions.subcoVersion) {
                args.push('--subco-version', versions.subcoVersion);
            }

            // If we have an uploaded file, pass it to the script
            if (uploadedFilePath && await fs.pathExists(uploadedFilePath)) {
                args.push('--version-file', uploadedFilePath);
            }

            const result = await this.executeScript(args);

            console.log('✅ Docker build and push completed successfully');
            return {
                success: true,
                message: 'Docker images built and pushed successfully',
                versions: versions,
                output: result.output
            };

        } catch (error) {
            console.error('❌ Docker build and push failed:', error.message);
            throw new Error(`Docker build failed: ${error.message}`);
        } finally {
            this.buildInProgress = false;
        }
    }

    executeScript(args = []) {
        return new Promise((resolve, reject) => {
            console.log(`Executing: ${this.scriptPath} ${args.join(' ')}`);

            const process = spawn('bash', [this.scriptPath, ...args], {
                cwd: path.dirname(this.scriptPath),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                console.log('[BUILD]', text.trim());
            });

            process.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                console.error('[BUILD ERROR]', text.trim());
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        output: output,
                        code: code
                    });
                } else {
                    reject(new Error(`Build script exited with code ${code}. Error: ${errorOutput}`));
                }
            });

            process.on('error', (error) => {
                reject(new Error(`Failed to start build script: ${error.message}`));
            });
        });
    }

    isBuildInProgress() {
        return this.buildInProgress;
    }

    async checkDockerRegistry(registryUrl = '100.103.254.213:5001') {
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const curl = spawn('curl', ['-s', '-f', `http://${registryUrl}/v2/`]);

            curl.on('close', (code) => {
                resolve(code === 0);
            });

            curl.on('error', () => {
                resolve(false);
            });
        });
    }
}

module.exports = DockerBuildManager;