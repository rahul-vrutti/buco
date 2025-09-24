const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// MQTT broker configuration
const MQTT_BROKER_URL = 'mqtt://localhost:1883';
const MESSAGE_TOPIC = '/message';

// Create MQTT client
const client = mqtt.connect(MQTT_BROKER_URL);

// Connection event handlers
client.on('connect', () => {
    console.log('Connected to MQTT broker at', MQTT_BROKER_URL);

    // Send a test message after connection
    sendMessage('Hello from MQTT client!');
});

client.on('error', (error) => {
    console.error('MQTT connection error:', error);
});

client.on('close', () => {
    console.log('MQTT connection closed');
});

client.on('reconnect', () => {
    console.log('MQTT client reconnecting...');
});

// Function to send binary file directly as single message
function sendBinaryFile(filePath) {
    try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return;
        }

        // Get file stats
        const stats = fs.statSync(filePath);
        console.log(`Preparing to send file: ${filePath}`);
        console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

        console.log('Reading entire file into memory...');
        // Read file as binary
        const fileBuffer = fs.readFileSync(filePath);
        console.log('File read successfully');

        // console.log('Converting to base64...');
        // // Convert to base64 for MQTT transmission
        // const base64Data = fileBuffer.toString('base64');
        // console.log('Base64 conversion completed');

        // const message = {
        //     timestamp: new Date().toISOString(),
        //     type: 'binary_file',
        //     filename: path.basename(filePath),
        //     size: stats.size,
        //     content: base64Data,
        //     source: 'buco-backend'
        // };

        // console.log('Creating JSON message...');
        // const messageString = JSON.stringify(message);

        // // Check message size
        // const messageSizeMB = Buffer.byteLength(messageString, 'utf8') / (1024 * 1024);
        // console.log(`Message size: ${messageSizeMB.toFixed(2)} MB`);

        console.log('Publishing to MQTT...');
        client.publish(MESSAGE_TOPIC, fileBuffer, { qos: 1 }, (error) => {
            if (error) {
                console.error('Failed to send binary file:', error);
            } else {
                console.log(`Binary file sent to topic ${MESSAGE_TOPIC}`);
                // console.log(`File: ${path.basename(filePath)} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
            }
        });

    } catch (error) {
        console.error('Error reading or sending binary file:', error);
    }
}

// Function to send message to the /message topic
function sendMessage(messageContent) {
    const message = {
        timestamp: new Date().toISOString(),
        content: messageContent,
        source: 'buco-backend'
    };

    const messageString = JSON.stringify(message);

    client.publish(MESSAGE_TOPIC, messageString, { qos: 1 }, (error) => {
        if (error) {
            console.error('Failed to send message:', error);
        } else {
            console.log(`Message sent to topic ${MESSAGE_TOPIC}:`, messageString);
        }
    });
}

// Function to subscribe to topics (optional)
function subscribeToTopic(topic) {
    client.subscribe(topic, (error) => {
        if (error) {
            console.error('Failed to subscribe to topic:', topic, error);
        } else {
            console.log('Subscribed to topic:', topic);
        }
    });
}

// Handle incoming messages (if subscribed to any topics)
client.on('message', (topic, message) => {
    console.log(`Received message on topic ${topic}:`, message.toString());
});

// Export functions for use in other modules
module.exports = {
    client,
    sendMessage,
    sendBinaryFile,
    subscribeToTopic,
    MESSAGE_TOPIC
};

// Example usage - send periodic messages (for testing)
if (require.main === module) {
    // This code runs only when the file is executed directly
    setTimeout(() => {
        // Send binary file instead of text message
        const binaryFilePath = path.join(__dirname, '../../subco/subco.js');
        // const binaryFilePath = path.join(__dirname, '../../1GB.bin');
        console.log('Sending binary file:', binaryFilePath);
        sendBinaryFile(binaryFilePath);

        // Also send a regular test message
        // const randomMessage = `Test message ${Date.now()}`;
        // sendMessage(randomMessage);
    }, 2000); // Send a message after 2 seconds

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('Closing MQTT connection...');
        client.end();
        process.exit(0);
    });
}
