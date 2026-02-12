/**
 * AWS Lambda function to publish a message to an SNS topic.
 * * This function is triggered by an API Gateway request and expects a JSON body
 * with the following structure:
 * {
 * "message": "The body of the message to be sent.",
 * "email": "The sender's email address.",
 * "phone": "The sender's phone number.",
 * "firstName": "The sender's first name.",
 * "lastName": "The sender's last name."
 * }
 * * It constructs a message and subject line from this data and publishes it
 * to the SNS topic specified in the `TOPIC_ARN` environment variable.
 */

// Import necessary classes from the AWS SDK for SNS.
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const handler = async (event, context) => {
  const region = process.env.AWS_REGION;
  const snsClient = new SNSClient({ region });
  const s3Client = new S3Client({ region });
  
  const topicArn = process.env.TOPIC_ARN;
  const bucketName = process.env.TEMP_ASSET_BUCKET_NAME;
  const fileName = process.env.DISPOSABLE_DOMAINS_LIST;
  
  const body = JSON.parse(event.body);
  const { message: messageBody, email, phone: phoneNumber, firstName, lastName, securityAnswer } = body;

  try {
    const s3Response = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName
    }));

    const domainsData = await s3Response.Body.transformToString();
    const disposableDomains = JSON.parse(domainsData);

    const userDomain = email.split('@')[1]?.toLowerCase();
    
    if (disposableDomains.includes(userDomain)) {
      console.warn(`Blocked message from disposable email: ${email}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Emails from disposable providers are not allowed." }),
      };
    }

    const subject = `Received a new message from ${firstName} ${lastName}`;
    const message = `${messageBody}\n\nEmail: ${email}\nPhone: ${phoneNumber}\nSecurity Answer: ${securityAnswer}`;

    const result = await snsClient.send(new PublishCommand({
      TopicArn: topicArn,
      Message: message,
      Subject: subject
    }));

    console.log(`Message published. MessageId: ${result.MessageId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Message sent successfully!" }),
    };

  } catch (error) {
    console.error("Processing error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error." }),
    };
  }
};