process.env.TABLE_NAME = 'url-shortener';
process.env.BASE_URL = 'https://short.ly';

jest.mock('nanoid', () => ({
    nanoid: () => 'ABCDEFGH',
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
// import { nanoid } from 'nanoid';
import { Handler } from '../../src/app';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
});

describe('POST / (create short URL)', () => {
    const baseEvent: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        requestContext: {
            // These two fields are used by your handler to build the `shortUrl`
            domainName: 'short.ly',
            stage: 'dev',
        } as any,
    };

    it('400 if no body provided', async () => {
        const ev = { ...baseEvent, body: undefined } as any;
        const res = (await Handler(ev)) as APIGatewayProxyResult;

        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/No body provided/);
    });

    it('422 if url is missing entirely', async () => {
        const ev = {
            httpMethod: 'POST',
            requestContext: { domainName: 'short.ly', stage: 'dev' } as any,
            body: JSON.stringify({}), // no "url" key
        } as any;

        const res = (await Handler(ev)) as APIGatewayProxyResult;
        expect(res.statusCode).toBe(422);
        expect(JSON.parse(res.body).error).toMatch(/"url" is required/);
    });

    it('400 for invalid JSON', async () => {
        const ev = { ...baseEvent, body: '{ not json }' } as any;
        const res = (await Handler(ev)) as APIGatewayProxyResult;

        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/Invalid JSON payload/);
    });

    it('422 for malformed URL', async () => {
        const ev = {
            ...baseEvent,
            body: JSON.stringify({ url: 'not-a-url' }),
        } as any;
        const res = (await Handler(ev)) as APIGatewayProxyResult;

        expect(res.statusCode).toBe(422);
        expect(JSON.parse(res.body).error).toMatch(/must be a valid uri/);
    });

    it('201 returns  shortUrl on success', async () => {
        ddbMock.on(PutCommand).resolves({});
        const ev = {
            ...baseEvent,
            body: JSON.stringify({ url: 'https://example.com' }),
        } as any;

        const res = (await Handler(ev)) as APIGatewayProxyResult;
        const body = JSON.parse(res.body);

        // shortUrl uses requestContext.domainName and capitalized stage
        expect(body.shortUrl).toBe('https://short.ly/Dev/ABCDEFGH');
        expect(res.statusCode).toBe(201);
    });

    it('500 if DynamoDB put fails', async () => {
        ddbMock.on(PutCommand).rejects(new Error('DB down'));
        const ev = {
            ...baseEvent,
            body: JSON.stringify({ url: 'https://example.com' }),
        } as any;

        const res = (await Handler(ev)) as APIGatewayProxyResult;
        expect(res.statusCode).toBe(500);
        expect(JSON.parse(res.body).error).toMatch(/Internal server error/);
    });
});

describe('GET /short/:shortCode (redirect)', () => {
    const baseEvent: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        pathParameters: { shortCode: 'ABCDEFGH' },
    };

    it('302 redirects when found', async () => {
        ddbMock.on(GetCommand).resolves({
            Item: { id: 'ABCDEFGH', url: 'https://example.com' },
        });

        const res = (await Handler(baseEvent as any)) as APIGatewayProxyResult;
        expect(res.statusCode).toBe(302);
        expect(res.headers).toHaveProperty('Location', 'https://example.com');
        expect(res.body).toBe('');
    });

    it('404 when item not found', async () => {
        ddbMock.on(GetCommand).resolves({});

        const res = (await Handler(baseEvent as any)) as APIGatewayProxyResult;
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).error).toMatch(/Not found/);
    });

    it('500 on DynamoDB failure', async () => {
        ddbMock.on(GetCommand).rejects(new Error('DB down'));

        const res = (await Handler(baseEvent as any)) as APIGatewayProxyResult;
        expect(res.statusCode).toBe(500);
        expect(JSON.parse(res.body).error).toMatch(/Internal server error/);
    });

    it('404 if no shortCode provided', async () => {
        const noParamEvent = { httpMethod: 'GET', pathParameters: null } as any;
        const res = (await Handler(noParamEvent)) as APIGatewayProxyResult;
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).error).toMatch(/Not found/);
    });
});

describe('Invalid method handling', () => {
    it('400 for any non‑GET/POST method', async () => {
        const ev = { httpMethod: 'DELETE' } as any;
        const res = (await Handler(ev)) as any;

        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/Invalid request/);
    });
});

describe('Module env‐var validation (import‐time errors)', () => {
    const APP_PATH = '../../src/app';

    beforeEach(() => {
        jest.resetModules();
    });

    it('throws if TABLE_NAME is not set', () => {
        delete process.env.TABLE_NAME;
        process.env.BASE_URL = 'https://short.ly';

        expect(() => require(APP_PATH)).toThrowError('Missing TABLE_NAME');
    });

    it('throws if BASE_URL is not set', () => {
        process.env.TABLE_NAME = 'url-shortener';
        delete process.env.BASE_URL;

        expect(() => require(APP_PATH)).toThrowError('Missing BASE_URL');
    });
});
