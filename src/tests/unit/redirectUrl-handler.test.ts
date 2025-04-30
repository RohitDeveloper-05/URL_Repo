process.env.TABLE_NAME = 'url-shortener';
process.env.BASE_URL = 'https://short.ly';

jest.mock('nanoid', () => ({
    nanoid: () => 'ABCDEFGH',
}));

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { Handler } from '../../app';
import { describe, it, expect, beforeEach } from '@jest/globals';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
});

describe('GET /get_url (redirect)', () => {
    const baseEvent = {
        requestContext: { http: { method: 'GET' } },
    };

    it('302 redirects to the original URL when item is found', async () => {
        ddbMock.on(GetCommand).resolves({
            Item: { id: 'ABCDEFGH', url: 'https://example.com' },
        });

        const event = {
            ...baseEvent,
            rawQueryString: 'id=ABCDEFGH',
        };

        const res = await Handler(event as any);

        expect(res.statusCode).toBe(302);
        expect(res.headers).toHaveProperty('Location', 'https://example.com');
        expect(res.body).toBe('');
    });

    it('404 returns “Not found” when no item exists', async () => {
        ddbMock.on(GetCommand).resolves({});

        const event = {
            ...baseEvent,
            rawQueryString: 'id=ABCDEFGH',
        };

        const res = await Handler(event as any);

        expect(res.statusCode).toBe(404);
        const body = JSON.parse(res.body);
        expect(body.error).toMatch(/Not found/);
    });

    it('500 returns “Internal server error” on DynamoDB failure', async () => {
        ddbMock.on(GetCommand).rejects(new Error('DB down'));

        const event = {
            ...baseEvent,
            rawQueryString: 'id=ABCDEFGH',
        };

        const res = await Handler(event as any);

        expect(res.statusCode).toBe(500);
        const body = JSON.parse(res.body);
        expect(body.error).toMatch(/Internal server error/);
    });

    it('400 returns “Invalid request” when rawQueryString is missing or malformed', async () => {
        const event = {
            requestContext: { http: { method: 'GET' } },
        };

        const res = await Handler(event as any);
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toMatch(/Invalid request/);
    });
});
