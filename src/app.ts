import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { nanoid } from 'nanoid';
import Joi from 'joi';

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.TABLE_NAME!;
if (!TABLE) throw new Error('Missing TABLE_NAME');

const BASE_URL = process.env.BASE_URL!;
if (!BASE_URL) throw new Error('Missing BASE_URL');

const postUrlSchema = Joi.object({
    url: Joi.string().uri().required(),
});

const formatResponse = (body: object, statusCode = 200) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

const formatError = (message: string, statusCode: number) => formatResponse({ error: message }, statusCode);

export const Handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const { body, httpMethod, requestContext } = event;
    console.log('Printing Event', event);

    if (httpMethod === 'POST') {
        if (!body) return formatError('No body provided', 400);

        let payload: { url: string };
        try {
            payload = JSON.parse(body);
        } catch {
            return formatError('Invalid JSON payload', 400);
        }

        const { error } = postUrlSchema.validate(payload, { abortEarly: false });
        if (error) {
            return formatError(error.details.map((d) => d.message).join('; '), 422);
        }

        const id = nanoid(8);
        try {
            await ddbDocClient.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: { id, url: payload.url },
                }),
            );
        } catch (dbErr) {
            console.error('DynamoDB put failed', dbErr);
            return formatError('Internal server error', 500);
        }

        return formatResponse(
            {
                uselessURL: `${BASE_URL}/short/${id}`,
                shortUrl: `https://${requestContext?.domainName}/${requestContext?.stage.toLowerCase()}/${id}`,
            },
            201,
        );
    } else if (httpMethod === 'GET') {
        const id = event.pathParameters?.shortCode;

        try {
            const result = await ddbDocClient.send(
                new GetCommand({
                    TableName: TABLE,
                    Key: { id },
                }),
            );
            if (!result.Item) return formatError('Not found', 404);

            return {
                statusCode: 302,
                headers: { Location: result.Item.url },
                body: '',
            };
        } catch (err) {
            console.error(err);
            return formatError('Internal server error', 500);
        }
    }

    return formatError('Invalid request', 400);
};
