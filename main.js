/**
 * @typedef {ReturnType<import("express")>} ExpressServer
 * @typedef {import("express").Request} ExpressRequest
 * @typedef {import("express").Response} ExpressResponse
 */

/**
 * @param {number | string} client_id 
 * @param {string} redirect_uri 
 * @param {string[] | string} scopes 
 */
export function makeStaticAuthorizationURl(client_id, redirect_uri, scopes = []){
    return `https://start.gg/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${scopes.join ? scopes.join(",") : scopes}`;
}

/**
 * @param {ExpressServer} server 
 * @param {string} path 
 * @param {string | number} client_id 
 * @param {string} redirect_uri 
 * @param {string | string []} scopes 
 * @param {string | (req: ExpressRequest) => string} state 
 */
export function initAuthorizationRedirectEndpoint(server, path, client_id, redirect_uri, scopes = [], state){
    const static_url = makeStaticAuthorizationURl(client_id, redirect_uri, scopes);
    const stateFunction = (typeof state == "function") ? state : () => state;
    server.get(path, (req, res) => {
        const state = stateFunction(req);
        const url = state ? (static_url + "&state=" + state) : static_url;
        res.redirect(url);
    })
}

/** 
 * @typedef {{access_token: string, refresh_token: string, expires_in: number}} StartggData 
 * @param {Request} req 
 * @param {StartggData} responseBody 
 * @param {boolean} isNew 
*/
function defaultTokenSetter(req, responseBody, isNew){
    const obj = {
        access_token: responseBody.access_token,
        refresh_token: responseBody.refresh_token,
        expires_in: responseBody.expires_in
    }
    req.session.startgg = obj;
    return obj;
}

/**
 * @param {ExpressServer} server 
 * @param {string?} path 
 * @param {string | number} client_id 
 * @param {string} client_secret 
 * @param {string} redirect_uri 
 * @param {string | string []} scopes
 * @param {string | (req: ExpressRequest, res: ExpressResponse) => void | null} callback
 * @param {typeof defaultTokenSetter} responseHandlerCallback
 */
export function initCallbackEndpoint(server, path, client_id, client_secret, redirect_uri, scopes, callback = null, responseHandlerCallback = defaultTokenSetter){
    const scope = scopes.join ? scopes.join(",") : scopes;

    if (!path) {
        try {
            path = new URL(redirect_uri).pathname;
        } catch (err){
            throw new Error("Cannot infer the callback endpoint path from the redirect_uri. Your redirect URI seems to be an invalid URL.", {
                cause: err
            });
        }
    }

    const callbackFunction = 
        typeof callback == "function" ? callback :
        typeof callback == "string" ? (_, res) => res.redirect(callback) :
        (_, res) => res.redirect("/");

    server.get(path, async (req, res) => {
        const code = req.query.code;
        if (!code){
            console.error("No code ?");
            res.status(500).send("start.gg sent a request to the redirect URI as if the authorization succeeded, but did not send the required code");
            return;
        } 

        const responseBody = await fetch("https://api.start.gg/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                client_id,
                client_secret,
                code,
                grant_type: "authorization_code",
                redirect_uri,
                scope
            })
        }).then(response => response.json());

        responseHandlerCallback(req, responseBody, true);

        callbackFunction(req, res);
    })
}

/** @param {Request} req @return {StartggData} */
function defaultTokenGetter(req){
    if (req.session) return req.session.startgg;
}

/**
 * @param {ExpressServer} server 
 * @param {string} path 
 */
export function initTokenEndpoint(server, path, client_id, client_secret, redirect_uri, scopes, startggDataGetter = defaultTokenGetter, responseHandlerCallback = defaultTokenSetter){
    const scope = scopes.join ? scopes.join(",") : scopes;

    server.get(path, async (req, res) => {
        let startgg = startggDataGetter(req);
        if (startgg){
            if (Date.now() > startgg.expires_in){
                const refresh_token = startgg.refresh_token;
                if (!refresh_token){
                    return res.status(401).json({err: "Not authenticated"})
                }   

                const responseBody = await fetch("https://api.start.gg/oauth/refresh", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        client_id,
                        client_secret,
                        refresh_token,
                        grant_type: "refresh_token",
                        redirect_uri,
                        scope
                    })
                }).then(response => response.json());

                startgg = responseHandlerCallback(req, responseBody, false) ?? startggDataGetter(req);
                //console.log("New token :", responseBody.access_token);
            }

            return res.status(200).json({token: startgg.access_token});
        } else {
            return res.status(401).json({err: "Not authenticated"});
        }
    });
}

/**
 * 
 * @param {ExpressServer} server 
 * @param {string | number} client_id 
 * @param {string} client_secret 
 * @param {string} redirect_uri 
 * @param {string | string []} scopes
 * @param {{authRedirect: string?, callback: string?, token: string?}} paths 
 * @param {{client_id: number | string, client_secret: string, redirect_uri: string, scopes: string | string []}} oauthConfig 
 * @param {{state?: string | (req: ExpressRequest) => string, finalCallback?: string | (req: ExpressRequest, res: ExpressResponse) => void | null, responseHandlerCallback?: typeof defaultTokenSetter, startggDataGetter?: typeof defaultTokenGetter}} config 
 */
export function initStartggOauth(server, client_id, client_secret, redirect_uri, scopes, paths = {}, config = {}){
    scopes = scopes.join ? scopes.join(",") : scopes;

    if (paths.authRedirect) initAuthorizationRedirectEndpoint(server, paths.authRedirect, client_id, redirect_uri, scopes, config.state);
    initCallbackEndpoint(server, paths.callback, client_id, client_secret, redirect_uri, scopes, config.finalCallback, config.responseHandlerCallback);
    if (paths.token) initTokenEndpoint(server, paths.token, client_id, client_secret, redirect_uri, scopes, config.startggDataGetter, config.responseHandlerCallback);
}

/**
 * @param {ExpressRequest} req 
 */
export function logOut(req){
    req.session.startgg = null;
}