const DockerBuilder = require('./backend/dockerBuilder');

async function testDockerBuild() {
    const dockerBuilder = new DockerBuilder();

    // Test versions that would trigger both buco and subco builds
    const testVersions = {
        fullPackageVersion: "1.3.0",
        bucoVersion: "1.3.0",
        subcoVersion: "1.3.0",
        mqttVersion: "3.3.3",
        dhcpVersion: "4.4.3"
    };

    console.log('🧪 Testing Docker build with versions:', testVersions);
    console.log('\n📋 What will be built:');

    if (testVersions.bucoVersion || testVersions.fullPackageVersion) {
        const bucoVersion = testVersions.bucoVersion || testVersions.fullPackageVersion;
        console.log(`✅ BUCO will be built with version: ${bucoVersion}`);
        console.log(`   - Image: 100.103.254.213:5001/buco:${bucoVersion}`);
        console.log(`   - Image: 100.103.254.213:5001/buco:latest`);
    }

    if (testVersions.subcoVersion) {
        console.log(`✅ SUBCO will be built with version: ${testVersions.subcoVersion}`);
        console.log(`   - Image: 100.103.254.213:5001/subco:${testVersions.subcoVersion}`);
        console.log(`   - Image: 100.103.254.213:5001/subco:latest`);
    }

    console.log('\n🚀 To actually test build and push:');
    console.log('Set TEST_BUILD=true to run actual build (may fail due to registry config)');

    if (process.env.TEST_BUILD === 'true') {
        console.log('\n🔨 Running actual build and push test...');
        try {
            const result = await dockerBuilder.buildAndPushAll(testVersions);
            console.log('\n✅ Build result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.log('\n❌ Build error:', error.message);
        }
    } else {
        console.log('\n💡 To run actual build: SET TEST_BUILD=true && node test-docker-build.js');
    }
}

testDockerBuild().catch(console.error);