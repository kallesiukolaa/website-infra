import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

/**
 * The main Lambda handler function.
 * @param {object} event The SQS event object.
 * @param {object} context The Lambda context object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const handler = async (event, context) => {
  console.log("Received SQS event:", JSON.stringify(event, null, 2));

  // Initialize the SNS client.
  const snsClient = new SNSClient({ region: process.env.AWS_REGION });

  // Define the target SNS topic ARN.
  const topicArn = process.env.TOPIC_ARN;

  // The SQS event can contain one or more messages in the 'Records' array.
  // We will iterate through each message to process it.
  for (const record of event.Records) {
    // The body of the SQS message is a string.
    const messageBody = record.body;

    // Log the message body to CloudWatch Logs.
    console.log("Processing SQS message:", messageBody);

    // Email
    const email = record.messageAttributes.Email.stringValue ?? 'unknown sender';

    // Firstname
    const firstName = record.messageAttributes.FirstName.stringValue ?? 'unknown name';

    // Lastname
    const lastName = record.messageAttributes.LastName.stringValue ?? 'unknown name';

    // Phonenumber
    const phoneNumber = record.messageAttributes.Phone.stringValue ?? 'unknown phone number';

    const subject = `Received a new message from ${firstName} ${lastName}`;

    const message = `${messageBody}

  Email: ${email}
  Phone number: ${phoneNumber}`;

    try {
      // Create a PublishCommand for the message.
      const params = {
        TopicArn: topicArn,
        Message: message,
        Subject: subject
      };

      const command = new PublishCommand(params);

      // Publish the message to the SNS topic.
      const result = await snsClient.send(command);
      console.log(`Message published successfully. MessageId: ${result.MessageId}`);
    } catch (error) {
      console.error("Error publishing message to SNS:", error);
      // You may want to handle errors, e.g., by re-throwing or logging.
      throw error; // Re-throw to indicate a failure in processing.
    }
  }

  // A successful response is indicated by the function completing without throwing an error.
  console.log("Successfully processed all messages.");
};