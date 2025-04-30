// jest.env.js -- New file needed to be created for storing them gglobally so that i can have global access
process.env.TABLE_NAME = 'url-shortener';
process.env.BASE_URL = 'https://short.ly';

jest.mock('nanoid', () => ({
    nanoid: () => 'ABCDEFGH',
}));

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Handler } from '../../app';
// import * as Nanoid from 'nanoid';
import { describe, it, expect, jest, afterAll, afterEach, beforeEach } from '@jest/globals';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset(); // clear any previous handlers
    process.env.TABLE_NAME = 'url-shortener';
    process.env.BASE_URL = 'https://short.ly';
});

describe('POST Method', () => {
    it('returns 400 if no body provided', async () => {
        const event = {
            requestContext: { http: { method: 'POST' } },
            body: null,
        };
        const res = await Handler(event as any);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/No body provided/);
    });

    it('returns 400 for invalid JSON', async () => {
        const event = {
            requestContext: { http: { method: 'POST' } },
            body: '{ not json }',
        };
        const res = await Handler(event as any);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/Invalid JSON payload/);
    });

    it('returns 422 for invalid URL format', async () => {
        const event = {
            requestContext: { http: { method: 'POST' } },
            body: JSON.stringify({ url: 'not-a-url' }),
        };
        const res = await Handler(event as any);
        expect(res.statusCode).toBe(422);
        expect(JSON.parse(res.body).error).toMatch(/must be a valid uri/);
    });

    it('creates a short URL on success', async () => {
        ddbMock.on(PutCommand).resolves({});

        // Stub nanoid for predictability
        // jest.spyOn(Nanoid, 'nanoid').mockReturnValue('ABCDEFGH');

        const event = {
            requestContext: { http: { method: 'POST' } },
            body: JSON.stringify({ url: 'https://example.com' }),
        };
        const res = await Handler(event as any);

        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body.shortUrl).toBe('https://short.ly/short/ABCDEFGH');
        expect(body.longUrl).toContain('id=ABCDEFGH');
    });

    it('returns 500 if DynamoDB put fails', async () => {
        ddbMock.on(PutCommand).rejects(new Error('DB down'));

        const event = {
            requestContext: { http: { method: 'POST' } },
            body: JSON.stringify({ url: 'https://example.com' }),
        };
        const res = await Handler(event as any);

        expect(res.statusCode).toBe(500);
        expect(JSON.parse(res.body).error).toMatch(/Internal server error/);
    });
});
