class APIResponseError extends Error {
    constructor(message, status, responseBody){
        const errorMessage = responseBody ? 
            (responseBody.error_description ?? responseBody.error) + ` (status ${status})` : 
            `server responded with status ${status}`;

        super(message + " : " + errorMessage);

        this.contextMessage = message;
        this.status = status;
        this.resBody = responseBody;
    }
}

/**
 * @param {string} message 
 * @param {Response} response 
 */
export async function createAPIResponseError(message, response){
    const responseBody = await response.json().catch(() => null);
    return new APIResponseError(message, response.status, responseBody);
}