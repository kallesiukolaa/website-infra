/**
 * The main Lambda handler function.
 * @param {object} event The SQS event object.
 * @param {object} context The Lambda context object.
 * @returns {Promise<void>} A promise that resolves when the function completes.
 */
export const handler = async (event, context) => {
  console.log("Received SQS event:", JSON.stringify(event, null, 2));

  // The SQS event can contain one or more messages in the 'Records' array.
  // We will iterate through each message to process it.
  for (const record of event.Records) {
    // The body of the SQS message is a string.
    const messageBody = record.body;

    // Log the message body to CloudWatch Logs.
    // AWS Lambda automatically sends any output from console.log to CloudWatch Logs.
    console.log("Processing SQS message:", messageBody);
  }

  // A successful response is indicated by the function completing without throwing an error.
  console.log("Successfully processed all messages.");
};