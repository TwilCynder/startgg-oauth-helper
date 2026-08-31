import session from "express-session";
import { initStartggOauth, makeStandardStartggData } from "../main.js";
import express from "express";

const SCOPES = "user.identity";

/** @param {string[]} names */
function checkEnvironmentVariables(...names){
    for (const name of names){
        if (!process.env[name]){
            throw `Missing Oauth environement variable ${name}`
        }
    }
}

checkEnvironmentVariables("SGG_OAUTH_CLIENT_ID", "SGG_OAUTH_REDIRECT_URI", "SGG_OAUTH_CLIENT_SECRET", "SESSION_SECRET");

const app = express();

app.use(session({
    secret: process.env.SESSION_SECRET,
    cookie: {
        httpOnly: true,
    },
    resave: false,
    saveUninitialized: false
}))

function testPointlessSetter(req, data){
    req.session.pointlessNesting = {
        startgg: makeStandardStartggData(data)
    }
}

function testPointlessGetter(req){
    return req.session.pointlessNesting ? req.session.pointlessNesting.startgg : null
}

initStartggOauth(app, process.env.SGG_OAUTH_CLIENT_ID, process.env.SGG_OAUTH_CLIENT_SECRET, process.env.SGG_OAUTH_REDIRECT_URI, SCOPES, {
    authRedirect: "/auth",
    callback: "/callback",
    token: "/token",
}, {
    responseHandlerCallback: testPointlessSetter,
    startggDataGetter: testPointlessGetter,
});

app.use(express.static("./site"))

const port = process.env.PORT ?? 8090;
app.listen(port);
console.log("Listening on port", port);

