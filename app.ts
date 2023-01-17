// import required modules
import { login } from "https://cdn.skypack.dev/masto@5"
import * as mod from "https://deno.land/std@0.171.0/dotenv/mod.ts";

import { config } from "https://deno.land/std@0.171.0/dotenv/mod.ts";

// define functions
function postStatus(message:string, masto:any) {
    // 
    const status = masto.v1.statuses.create({
        status: message,
        visibility: "unlisted",
    })
}

// retrieve environment variables
const env = await config();
console.info("env file loaded")

// check that required information was loaded from env
const requiredVars:string[] = [
    "CLIENT_KEY",
    "CLIENT_SECRET",
    "ACCESS_TOKEN"
]

for (let index = 0; index < requiredVars.length; index++) {
    if (env[requiredVars[index]] == undefined) {
        throw new Error(env[requiredVars[index]] + " was not configured.");
    }
}

// login
const masto = await login({
    url: 'https://botsin.space',
    accessToken: env["ACCESS_TOKEN"],
})
