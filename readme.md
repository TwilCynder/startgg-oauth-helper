# startgg-oauth-helper
Library functions initializing the express routes required to deal with the start.gg Oauth authentication flow.

Note that you always need to first create an Oauth App on your start.gg developper settings. 

While this package does not have dependencies to avoid versioning issues, it **requires** an `express` server, and an `express-session` middleware to be in use.

## Notions : 
- Client ID, Client Secret : These need to be the ones that start.gg gives you on your Oauth App's page 
- Redirect URI : The one that you set on your Oauth App's page (must always be strictly the same on their end and in your server)
- Scopes : a comma separated list of scopes which are informations and capabilities that your asking access to. This isn't part of your app configuration, as it can be different for every login ; however it is always entirely static when using this package (set on server initialization). All functions taking "scopes" as parameters also accept an array of strings. 

## What this package does  
(skip below if you know how Oauth works and just want the functions to call)  
The normal OAuth flow is as follows : client requests (or is redirected to) start.gg "auth URI", which leads to their login/authorization page ; once authorization is completed the page requests for our server's "callback endpoint" using the Redirect URI we gave it (see above), with a code included in the request ; our server is then supposed to ask start.gg's "token" endpoint for an actual API token in exchange for the code. This token can be used to interact with the API but has an expiration date ; it is received along a "refresh token", that can be used to fetch a new tokens from start.gg's token refresh endpoint.  
What this package does is initialize the "callback" endpoint in the form of an express route, handles everything up to the token obtention, saves the token using express-session cookies, then redirects to a configured URL on the site. Any subsequent request from the same client now has access to an usable API token ; refreshing the token can be handled using an optional route ; more technical details as well as optional helper endpoints are described in the section below.

## Functions and express routes
The parameters common to most functions of this package are to be understood as follows :  
- **client_id, client_secret, redirect_uri** : the App parameters presented in the previous section
- **scopes** : the scopes list presented in the previous section
- **server** : an Express server/app
- **path** : the path of the endpoint to be initialized  

Three routes can be initialized by this package, by three separate functions
- **initAuthorizationRedirectEndpoint(server, path, client_id, redirect_uri, scopes = [], state)** [OPTIONAL] : initializes the "**auth redirect**" endpoint, which redirects the request to start.gg's auth endpoint (which leads to start.gg login/authorization pages). This route is optional as requesting for start.gg's auth endpoint can be done by the client ; however, as the URL includes parameters such as the client_id, scopes, etc, it is generally better to let the server handle the formation of the URL.  
The `state` parameter is added to the auth URL, as a `state` query property, which start.gg includes in its own redirection to our "callback" route so we can retrieve it. It can be either a string (which will be passed as-is) or a function taking a Request object and returning a string.  
- **initCallbackEndpoint(server, path, client_id, client_secret, redirect_uri, scopes, callback)** : initializes the oauth "**callback**" endpoint, which receives the redirect from start.gg's page, and handles obtaining the API token, then saves it using express-session. 
    - Since this endpoint is what start.gg will request using the Redirect URI we gave it, it needs to have the same path as the aformentioned URI. As such, the `path` parameter is uniquely optional on this function, as it can (and should) be infered from the Redirect URI
    - The token, as well as the Oauth refresh token, and API token expiration date, are saved using express-session under the `startgg` property. This means that after the token is first obtained, and as long as `express-session`'s middleware is in use, for all subsequest requests (to any route) from the same client, `req.session.startgg` will have the following value :
        ```js
        {
            access_token: "token",
            refresh_token: "refresh token",
            expires_in: date

        }
        ```
    - After everything is completed, this endpoint redirects to another route that is supposed to serve an actual page, and depends on the `callback` parameter :
      - No value : will redirect to  `/`
      - string : will use that string as a path
      - function : this function will be called with the `req` and `res` objects as parameters. In this case no redirection will be performed unless your callback does it itself !
- **initTokenEndpoint(server, path, client_id, client_secret, redirect_uri, scopes)** [OPTIONAL] : initializes the "**token**" route, which returns the token to the client. This is useful if you want your client code to actually be able to obtain the token (to run start.gg API requests from the client code) ; another option is to let the server handle all API requests (on demand from the client, which means setting up your own routes, a local API if you will), which is a bit more complicated to setup but usually considered better practice as the token is never passed to the client. Which is actually not that much of an issue but yknow.  
Note that this route handles **refreshing the token** : if the client asks for the token and it's expired, this route will refresh it (by sending a request to start.gg's refresh_token endpoint with the refresh_token we got along the API token) before sending the new one to the client. 

Note that calling all these functions can be condensed into one call to **initStartggOauth(server, client_id, client_secret, redirect_uri, scopes, paths = {}, config = {})**
- The `paths` parameter must be an object containing the path for each route.
    ```js  
    {
        authRedirect: "/auth-redirect-path",
        callback: "/callback-path",
        token: "/token-path"
    }
    ```  
    Omitting the path for an optional route will disable this route. The path for the "callback" route will always be passed as-is, but can be omitted as this route's path can (as explained above), be inferred from the Redirect URI
- The `config` parameter must be an object and contains additional options : 
  - `state` : passed as the `state` parameter to the "auth redirect" route init function
  - `finalCallback` passed as the `callback` parameter to the "callback" route init function

