import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import https from 'https';
import path from 'path';

const s3 = new S3Client({});

export const handler = async (event) => {
    const fileUrl = process.env.FILE_URL;
    const bucketName = process.env.TEMP_ASSET_BUCKET_NAME;
    const fileName = process.env.FILE_NAME;

    if (!fileUrl || !bucketName) {
        console.error('Error: Missing SOURCE_FILE_URL or S3_BUCKET_NAME environment variables.');
        return { statusCode: 500, body: 'Configuration Error' };
    }

    const key = path.basename(fileUrl) || 'downloaded-file';

    try {
        const result = await new Promise((resolve, reject) => {
            https.get(fileUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file. HTTP Status: ${response.statusCode}`));
                    return;
                }

                const parallelUploads3 = new Upload({
                    client: s3,
                    params: {
                        Bucket: bucketName,
                        Key: key,
                        Body: response, 
                        ContentType: response.headers['content-type']
                    },
                });

                parallelUploads3.done()
                    .then((data) => resolve(data))
                    .catch((err) => reject(err));

            }).on('error', (err) => reject(err));
        });

        console.log(`Success: File uploaded to ${result.Location}`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Upload successful', path: result.Location })
        };

    } catch (error) {
        console.error('Upload failed:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};