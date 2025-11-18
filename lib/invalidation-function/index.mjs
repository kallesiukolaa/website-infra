import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

// The distribution IDs are now pulled from the Lambda environment variables
// DISTRIBUTION_ID_COM and DISTRIBUTION_ID_FI.
const DISTRIBUTION_IDS = [
    process.env.DISTRIBUTION_ID_COM, 
    process.env.DISTRIBUTION_ID_FI
].filter(id => id); // Filter out any undefined or empty IDs

const PATH_TO_INVALIDATE = "/*"; 
const cloudFront = new CloudFrontClient({});

/**
 * @function handler
 * @description 
 * Creates a cache invalidation request in multiple AWS CloudFront distributions.
 * This function is designed to be triggered by an event (e.g., API Gateway, S3, or manually).
 * It reads the target distribution IDs from the Lambda environment variables 
 * DISTRIBUTION_ID_COM and DISTRIBUTION_ID_FI.
 * The invalidation path is hardcoded to "/*" to clear the entire cache for both distributions.
 *
 * @param {object} event - The Lambda event object. Not directly used, but standard for Lambda handler.
 * @param {object} context - The Lambda context object.
 * @returns {object} - A response object containing the status and details of all invalidation requests.
 * * @example
 * // Environment Variables required:
 * // DISTRIBUTION_ID_COM: E123ABCEXAMPLE
 * // DISTRIBUTION_ID_FI: E456DEFEXAMPLE
 * * @requires 
 * IAM Policy with 'cloudfront:CreateInvalidation' permission for the Lambda Execution Role.
 */
export const handler = async (event, context) => {
    if (DISTRIBUTION_IDS.length === 0) {
        console.error("ERROR: No valid distribution IDs found in environment variables.");
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "No CloudFront Distribution IDs were configured." }),
        };
    }
    
    console.log(`Starting CloudFront invalidation for paths: ${PATH_TO_INVALIDATE} on distributions: ${DISTRIBUTION_IDS.join(', ')}`);
    
    const invalidationPromises = DISTRIBUTION_IDS.map(async (distributionId) => {
        const command = new CreateInvalidationCommand({
            DistributionId: distributionId,
            InvalidationBatch: {
                // Generates a unique reference using function name, timestamp, and distribution ID
                CallerReference: `${context.functionName}-${Date.now()}-${distributionId}`,
                Paths: {
                    Quantity: 1,
                    Items: [PATH_TO_INVALIDATE],
                },
            },
        });

        try {
            const response = await cloudFront.send(command);
            console.log(`Successfully submitted invalidation for Distribution ${distributionId}. Invalidation ID: ${response.Invalidation.Id}`);
            return {
                distributionId,
                status: "SUBMITTED",
                invalidationId: response.Invalidation.Id,
            };
        } catch (error) {
            console.error(`Error submitting invalidation for Distribution ${distributionId}:`, error);
            return {
                distributionId,
                status: "FAILED",
                error: error.message,
            };
        }
    });

    const results = await Promise.all(invalidationPromises);
    
    console.log("CloudFront invalidation process complete.");

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: `CloudFront invalidation requests submitted for ${results.length} distributions.`,
            results: results,
        }),
    };
};