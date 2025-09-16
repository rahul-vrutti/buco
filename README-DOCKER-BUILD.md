# Buco Docker Auto-Build and Push System

This system automatically builds and pushes Docker images to your local registry when you upload version update files.

## Features

- **Automatic Version Detection**: Parses version information from uploaded files
- **Docker Build Automation**: Automatically builds frontend, backend, and combines them
- **Multi-Service Support**: Builds both buco and subco Docker images
- **Registry Push**: Pushes images with version tags and 'latest' tags
- **MQTT Integration**: Notifies other services via MQTT

## How It Works

### 1. Upload Version File
Upload a text file through the web UI with version information:

```
# Version Update File
buco: 1.0.1
subco: 2.0.1
```

### 2. Automatic Process
When you upload the file, the system:
1. Parses version information from the file
2. Builds the frontend React application
3. Combines frontend and backend into the build directory
4. Builds Docker images for both buco and subco
5. Tags images with versions and 'latest'
6. Pushes images to the local registry (100.103.254.213:5001)
7. Notifies other services via MQTT

## API Endpoints

### Upload File (Triggers Build)
```bash
POST /api/upload
Content-Type: multipart/form-data
File: version update file
```

### Manual Build and Push
```bash
POST /api/build-and-push
Content-Type: application/json
{
  "bucoVersion": "1.0.1",
  "subcoVersion": "2.0.1"
}
```

### Check Build Status
```bash
GET /api/build-status
```
Returns: `{"buildInProgress": false}`

### Check Registry Status
```bash
GET /api/registry-status
```
Returns: `{"accessible": true, "registry": "100.103.254.213:5001"}`

## Generated Images

For version 1.0.1, the following images are created and pushed:

### Buco Images:
- `100.103.254.213:5001/buco:1.0.1`
- `100.103.254.213:5001/buco:latest`

### Subco Images:
- `100.103.254.213:5001/subco:2.0.1`
- `100.103.254.213:5001/subco:latest`

## Manual Usage

### Build Script Only
```bash
cd /root/demo/buco
./scripts/build.sh
```

### Docker Build and Push Script
```bash
cd /root/demo/buco
./scripts/docker-build-push.sh --buco-version 1.0.1 --subco-version 2.0.1
```

### With Version File
```bash
./scripts/docker-build-push.sh --version-file /path/to/version.txt
```

## Prerequisites

1. **Docker Registry**: Ensure the local registry is running at `100.103.254.213:5001`
2. **Docker Access**: Ensure the system has Docker access and can build images
3. **Network Access**: Registry must be accessible from the build system
4. **Dependencies**: Node.js, npm, and all project dependencies installed

## File Structure

```
buco/
├── scripts/
│   ├── build.sh                 # Builds frontend and combines with backend
│   └── docker-build-push.sh     # Builds and pushes Docker images
├── backend/
│   ├── server.js                # Modified to trigger builds
│   └── dockerBuildManager.js    # Docker build management
├── frontend/                    # React frontend
├── build/                       # Combined build output
│   ├── Dockerfile              # Production Dockerfile
│   ├── server.js               # Backend server
│   └── front/                  # Built frontend
└── uploads/                     # Uploaded version files
```

## Version File Format

The system supports multiple formats for version files:

```
# Hash-style comments are ignored
buco: 1.0.1
subco: 2.0.1

# Alternative formats:
buco=1.0.1
subco=2.0.1

# Or with spaces:
buco 1.0.1
subco 2.0.1
```

## Error Handling

- Build failures don't prevent file upload completion
- Registry connectivity is checked before builds
- Build progress prevents concurrent builds
- Detailed logging for troubleshooting

## Testing

1. **Test Registry Connection**:
   ```bash
   curl http://100.103.254.213:5001/v2/
   ```

2. **Test Build Process**:
   ```bash
   cd /root/demo/buco
   ./scripts/build.sh
   ```

3. **Test Docker Build**:
   ```bash
   ./scripts/docker-build-push.sh --buco-version test --subco-version test
   ```

## Monitoring

- Check build status: `GET /api/build-status`
- Check registry status: `GET /api/registry-status`
- View console logs for detailed build information
- MQTT messages notify connected services of updates