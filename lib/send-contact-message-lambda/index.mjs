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

/**
 * The main handler for the Lambda function.
 * @param {object} event The event object containing the request body.
 * @param {object} context The context object.
 * @returns {object} A response object.
 */
export const handler = async (event, context) => {
  // Initialize the SNS client with the region from environment variables.
  const client = new SNSClient({ region: process.env.AWS_REGION });
  
  // Get the ARN of the SNS topic from environment variables.
  const topicArn = process.env.TOPIC_ARN;
  
  // Parse the JSON body of the incoming event.
  const body = JSON.parse(event.body);

  // Extract message details from the parsed body.
  const messageBody = body.message;
  const email = body.email;
  const phoneNumber = body.phone;
  const firstName = body.firstName;
  const lastName = body.lastName;
  const securityAnswer = body.securityAnswer;

  // Construct a clear subject line for the SNS message.
  const subject = `Received a new message from ${firstName} ${lastName}`;

  // Construct the full message to be sent, including contact details.
  const message = `${messageBody}

Email: ${email}
Phone number: ${phoneNumber}
The answer for the security question: ${securityAnswer}`;

  try {
    // Define the parameters for the PublishCommand.
    const params = {
      TopicArn: topicArn,
      Message: message,
      Subject: subject
    };

    // Create a new PublishCommand with the defined parameters.
    const command = new PublishCommand(params);

    // Send the command to the SNS client to publish the message.
    const result = await client.send(command);
    
    // Log a success message with the MessageId for tracking.
    console.log(`Message published successfully. MessageId: ${result.MessageId}`);

    // Return a success response.
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Message sent successfully!" }),
    };
  } catch (error) {
    // Log the error to the console.
    console.error("Error publishing message to SNS:", error);
    
    // Return an error response.
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to publish message." }),
    };
  }
};