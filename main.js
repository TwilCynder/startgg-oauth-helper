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
 * @param {ExpressServer} server 
 * @param {string?} path 
 * @param {string | number} client_id 
 * @param {string} client_secret 
 * @param {string} redirect_uri 
 * @param {string | string []} scopes
 * @param {string | (req: ExpressRequest, res: ExpressResponse) => void | null} callback
 */
export function initCallbackEndpoint(server, path, client_id, client_secret, redirect_uri, scopes, callback = null){
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
        typeof callback == "string" ? (_req, res) => res.redirect(callback) :
        (_req, res) => res.redirect("/");

    server.get(path, async (req, res) => {
        const code = req.query.code;
        if (!code){
            res.status(400).send("Start.gg didn't send a code.");
            return;
        } 

        const tokenResponse = await fetch("https://api.start.gg/oauth/access_token", {
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
        });

        if (!tokenResponse.ok) {
            res.status(502).send("Token exchange failed: " + tokenResponse.status);
            return;
        }

        const responseBody = await tokenResponse.json();

        req.session.startgg = {
            access_token: responseBody.access_token,
            refresh_token: responseBody.refresh_token,
            expires_at: Date.now() + responseBody.expires_in * 1000
        }

        callbackFunction(req, res);
    })
}

/**
 * 
 * @param {ExpressServer} server 
 * @param {string} path 
 */
export function initTokenEndpoint(server, path, client_id, client_secret, redirect_uri, scopes){
    const scope = scopes.join ? scopes.join(",") : scopes;

    server.get(path, async (req, res) => {
        if (req.session.startgg){
            if (Date.now() > req.session.startgg.expires_at){
                const refresh_token = req.session.startgg.refresh_token;
                if (!refresh_token){
                    return res.status(401).json({err: "Not authenticated"})
                }   

                const refreshResponse = await fetch("https://api.start.gg/oauth/refresh", {
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
                });

                if (!refreshResponse.ok) {
                    req.session.startgg = null;
                    return res.status(401).json({err: "Token refresh failed: " + refreshResponse.status});
                }

                const responseBody = await refreshResponse.json();

                req.session.startgg = {
                    access_token: responseBody.access_token,
                    refresh_token: responseBody.refresh_token,
                    expires_at: Date.now() + responseBody.expires_in * 1000
                }
            }

            return res.status(200).json({token: req.session.startgg.access_token});
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
 * @param {{state: string | (req: ExpressRequest) => string, finalCallback: string | (req: ExpressRequest, res: ExpressResponse) => void | null}} config 
 */
export function initStartggOauth(server, client_id, client_secret, redirect_uri, scopes, paths = {}, config = {}){
    scopes = scopes.join ? scopes.join(",") : scopes;

    if (paths.authRedirect) initAuthorizationRedirectEndpoint(server, paths.authRedirect, client_id, redirect_uri, scopes, config.state);
    initCallbackEndpoint(server, paths.callback, client_id, client_secret, redirect_uri, scopes, config.finalCallback);
    if (paths.token) initTokenEndpoint(server, paths.token, client_id, client_secret, redirect_uri, scopes);
}

/**
 * @param {ExpressRequest} req 
 */
export function logOut(req){
    req.session.startgg = null;
}