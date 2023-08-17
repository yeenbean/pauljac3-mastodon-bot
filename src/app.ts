// quit if just refreshing cache
if (Deno.args[0] == "--refresh") close();

const header = `                   __  _          ____
   ___  ___ ___ __/ / (_)__ _____|_  /
  / _ \\/ _ \`/ // / / / / _ \`/ __//_ < 
 / .__/\\_,_/\\_,_/_/_/ /\\_,_/\\__/____/ 
/_/              |___/
                       for Mastodon and Bluesky.`;
console.log(header);
console.log();
console.log();

// import required modules
import { createRestAPIClient } from "npm:masto@^6";
import { config } from "https://deno.land/std@0.171.0/dotenv/mod.ts";
import * as loggy from "https://deno.land/x/loggy@0.0.2/main.ts";
import { Database } from "https://deno.land/x/aloedb@0.9.0/mod.ts";
import api from "npm:@atproto/api@^0.6";
import { TwitterApi, TwitterApiTokens } from "npm:twitter-api-v2@^1.15.1";
const { BskyAgent } = api; // it doesnt work unless i do this. goofy fkn module.

// retrieve environment variables
const env = await config();
//loggy.info("env file loaded");

// check that required information was loaded from env
const requiredVars: string[] = [
  "CLIENT_KEY",
  "CLIENT_SECRET",
  "ACCESS_TOKEN",
  "BSKY_ID",
  "BSKY_PW",
  "BSKY_URL",
  "DEBUG",
  "TWITTER_API_KEY",
  "TWITTER_API_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_TOKEN_SECRET",
  "TWITTER_BEARER_TOKEN",
];

for (let index = 0; index < requiredVars.length; index++) {
  if (env[requiredVars[index]] == undefined) {
    throw new Error(env[requiredVars[index]] + " was not configured.");
  }
}

// set up debugging output
let debugEnabled = false;
if (env["DEBUG"] == "true") debugEnabled = true;
function debug(message: string): void {
  if (debugEnabled) loggy.debug(message);
}

// login to masto
const masto = createRestAPIClient({
  url: "https://botsin.space",
  accessToken: env["ACCESS_TOKEN"],
});
loggy.success("Connected to Mastodon.");

// login to bsky
debug("Creating Bluesky agent");
const bsky = new BskyAgent({
  service: env["BSKY_URL"],
});
debug("Logging into Bluesky");
await bsky.login({
  identifier: env["BSKY_ID"],
  password: env["BSKY_PW"],
});
loggy.success("Connected to Bluesky.");

// login to twitter
const twitterTokens: TwitterApiTokens = {
  appKey: env["TWITTER_API_KEY"],
  appSecret: env["TWITTER_API_SECRET"],
  accessToken: env["TWITTER_ACCESS_TOKEN"],
  accessSecret: env["TWITTER_ACCESS_TOKEN_SECRET"],
};
const twitterUserClient = new TwitterApi(twitterTokens);
const rwTwitter = twitterUserClient.readWrite;

// build tweets array
debug("Building tweets array");
const tweets = Deno.readTextFileSync("./src/tweet_file.txt").split("\n");
loggy.success(`${tweets.length} posts loaded.`);

debug("Building fedi posts");
const fediPosts = Deno.readTextFileSync("./src/tweet_file_fedi.txt").split(
  "\n",
);
loggy.success(`${fediPosts.length} posts loaded.`);

debug("Building bsky posts");
const bskyPosts = Deno.readTextFileSync("./src/tweet_file_bsky.txt").split(
  "\n",
);
loggy.success(`${bskyPosts.length} posts loaded.`);

debug("Building replies");
const replies = Deno.readTextFileSync("./src/reply_random.txt").split(
  "\n",
);
loggy.success(`${replies.length} replies loaded.`);

if (
  tweets.length != fediPosts.length || tweets.length != bskyPosts.length ||
  fediPosts.length != bskyPosts.length
) {
  loggy.critical("All tweet files must have the exact same length");
  throw new Error("Tweet file lengths do not match.");
}

// TODO: build random reply array

// define database interface
interface PauljacSchema {
  id: number;
  tweet: number;
  lastRepliedMastodon: string;
  lastRepliedBluesky: string;
}

// initialize database
const db = new Database<PauljacSchema>({
  path: "./db.json",
  pretty: true,
  autoload: true,
  autosave: true,
  optimize: true,
  immutable: true,
});
loggy.success("Database structure initialized in memory");
loggy.log("Checking database integrity...");

// create new structure if brand new db
const count = await db.count();
if (count == 0) {
  const init: PauljacSchema = {
    id: 0,
    tweet: 0,
    lastRepliedBluesky: "",
    lastRepliedMastodon: "",
  };
  await db.insertOne(init);
  loggy.info("Database has been initialized with new data.");
  loggy.info("This is normal if you're running the bot for the first time.");
}

try {
  // load the expected database entry
  debug("Making sure db loads correctly");
  const test = await db.findOne({
    id: 0,
  });

  // Validate database entry
  if (!test) throw new Error("Database entry missing.");
  if (test.id != 0) throw new Error("The wrong database entry was loaded.");
  loggy.debug(`id:\t\t${test.id}`);
  loggy.debug(`tweet:\t${test.tweet}`);
  loggy.success(`Database loaded.`);
} catch (error) {
  loggy.critical(
    "The primary database entry is missing. Is your database corrupt?",
  );
  loggy.critical(error);
  close();
}

// define functions
/**
 * This function posts a status message to each connected account.
 * @param message The status to post to each account.
 */
async function postStatus(
  fediPost: string,
  bskyPost: string,
  twitterPost: string,
) {
  // in the future, this function will also post to bluesky. each individual platform will move to its own function for actual posting functionality. yes ik thats hard to read im eepy.
  // Try to post to Mastodon
  try {
    debug("Posting to mastodon");
    await masto.v1.statuses.create({
      status: fediPost,
      visibility: "unlisted",
    });
    loggy.up(`"fedi: ${fediPost}"`);
  } catch (error) {
    loggy.fail(`There was a problem while posting to Mastodon: ${error}`);
  }

  // Try to post to Bluesky
  try {
    debug("Posting to Bluesky");
    await bsky.post({
      text: bskyPost,
    });
    loggy.up(`"bluesky: ${bskyPost}"`);
  } catch (error) {
    loggy.fail(`There was a problem while posting to Bluesky: ${error}`);
  }

  // Try posting to *shudders* X
  try {
    await rwTwitter.v2.tweet(twitterPost);
    loggy.up(`"twitter: ${twitterPost}"`);
  } catch (error) {
    loggy.fail(`There was a problem while posting to Twitter: ${error}`);
  }
}

/**
 * This function picks a random tweet from the tweet file, then returns it.
 * @returns The string of a random status message from the tweet file.
 */
function _getRandomStatus(): string {
  return tweets[Math.floor(Math.random() * tweets.length)];
}

/**
 * Posts the next status sequentially in the tweet file.
 * Each execution of this function calls postStatus() to post a status message
 * and updates the database to track the next status to be posted.
 */
async function postNextStatus(): Promise<void> {
  try {
    // load db entry
    const entry = await db.findOne({ id: 0 });
    if (entry == null) throw new Error("Error while loading database.");

    // this prevents empty posts from being published if the tweet file is ever shortened.
    if (entry.tweet >= tweets.length) {
      entry.tweet = 0;
      debug("Index was out of range so it was reset");
    }

    // post to socials
    debug("Posting...");
    postStatus(
      fediPosts[entry.tweet],
      bskyPosts[entry.tweet],
      tweets[entry.tweet],
    );
    debug("Posted successfully");

    // increment
    entry.tweet = entry.tweet + 1;
    if (entry.tweet >= tweets.length) {
      entry.tweet = 0;
      debug("Index reached limit, tweets will start from the top");
    }

    // save db entry
    await db.updateOne({ id: 0 }, entry);
  } catch (error) {
    loggy.critical(
      `There was an error while posting the status message: ${error}`,
    );
  }
}

async function postReplies(): Promise<void> {
  await postMastoReplies();
  await postBskyReplies();
}

async function postBskyReplies(): Promise<void> {
  let bskyNotifsCount = undefined;
  try {
    bskyNotifsCount = await bsky.app.bsky.notification.getUnreadCount();
  } catch (error) {
    loggy.fail(
      `There was an error retrieving the unread notification count for Bluesky.`,
    );
    loggy.fail(`${error}`);
    return;
  }
  debug(`bsky: notif count: ${bskyNotifsCount?.data.count}`);

  if (bskyNotifsCount == undefined || bskyNotifsCount.data.count <= 0) return;

  const bskyNotifs = await bsky.app.bsky.notification.listNotifications({
    limit: bskyNotifsCount.data.count,
  });
  debug(
    `bsky: notifs count scraped: ${bskyNotifs.data.notifications.length}`,
  );
  await bsky.app.bsky.notification.updateSeen({
    seenAt: new Date().toISOString(),
  });
  try {
    for (let index = 0; index < bskyNotifs.data.notifications.length; index++) {
      if (bskyNotifs.data.notifications[index].reason == "reply") {
        debug(
          `Replying to ${bskyNotifs.data.notifications[index].author.handle}`,
        );
        bsky.post({
          reply: {
            root: {
              uri: bskyNotifs.data.notifications[index].uri,
              cid: bskyNotifs.data.notifications[index].cid,
            },
            parent: {
              uri: bskyNotifs.data.notifications[index].uri,
              cid: bskyNotifs.data.notifications[index].cid,
            },
          },
          text: `${replies[Math.floor(Math.random() * replies.length)]}`,
        });
      }
    }
  } catch (error) {
    loggy.fail("There was an error while processing Bluesky notifications.");
    loggy.fail(`${error}`);
  }
}

async function postMastoReplies(): Promise<void> {
  const notifications = await masto.v1.notifications.list();
  await masto.v1.notifications.clear();

  if (!notifications) return;
  if (notifications.length == 0) return;

  for (let index = 0; index < notifications.length; index++) {
    if (notifications[index].type != "mention") break; // we only want him to respond to mentions

    try {
      await masto.v1.statuses.$select(notifications[index].status!.id)
        .favourite();
      masto.v1.statuses.create({
        status: `@${notifications[index].account.acct} ${
          replies[Math.floor(Math.random() * replies.length)]
        }`,
        visibility: "unlisted",
        inReplyToId: notifications[index].status!.id,
      });
    } catch (error) {
      loggy.fail(error);
    }
  }
}

/**
 * This function blocks the thread for the specified amount of time.
 * @param milliseconds Time in milliseconds to sleep
 */
function sleepSync(milliseconds: number) {
  const startTime = Date.now();
  while (Date.now() - startTime < milliseconds) {
    // Do nothing, effectively blocking the thread
  }
}

/**
 * Heartbeat function. This should run every 60 seconds.
 */
function heartbeat() {
  debug("Heartbeat");
  const date = new Date();

  if (date.getMinutes() % 30 == 0) {
    postNextStatus(); // do not await this so theres less risk of the heartbeat getting out of sync!
  }

  postReplies();
}

// Before triggering the heartbeat, we want to synchronize the thread so that the heartbeat starts at the top of the minute.
const now = new Date();
let next: Date;
if (now.getMinutes() == 59) {
  if (now.getHours() == 23) {
    next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
  } else {
    next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours() + 1,
      0,
      0,
      0,
    );
  }
} else {
  next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes() + 1,
    0,
    0,
  );
}

switch (Deno.args[0]) {
  case "--clearNotifs": {
    await bsky.app.bsky.notification.updateSeen({
      seenAt: new Date().toISOString(),
    });
    await masto.v1.notifications.clear();
    break;
  }
  case "--testReply":
    loggy.log("doing the thing");
    await postReplies();
    loggy.log("done");
    setInterval(close, 10000);
    break;

  case "--testBsky": {
    const bskyNotifsCount = await bsky.app.bsky.notification.getUnreadCount();
    debug(`bsky: notif count: ${bskyNotifsCount.data.count}`);

    if (bskyNotifsCount.data.count <= 0) close();

    const bskyNotifs = await bsky.app.bsky.notification.listNotifications({
      limit: bskyNotifsCount.data.count,
    });
    debug(
      `bsky: notifs count scraped: ${bskyNotifs.data.notifications.length}`,
    );
    await bsky.app.bsky.notification.updateSeen({
      seenAt: new Date().toISOString(),
    });

    for (let index = 0; index < bskyNotifs.data.notifications.length; index++) {
      if (bskyNotifs.data.notifications[index].reason == "mention") {
        bsky.post({
          reply: {
            root: {
              uri: bskyNotifs.data.notifications[index].uri,
              cid: bskyNotifs.data.notifications[index].cid,
            },
            parent: {
              uri: bskyNotifs.data.notifications[index].uri,
              cid: bskyNotifs.data.notifications[index].cid,
            },
          },
          text: `${replies[Math.floor(Math.random() * replies.length)]}`,
        });
      }
    }
    break;
  }

  case undefined:
    debug("Synchronizing to the top of the minute...");
    sleepSync(Math.abs(next.getTime() - now.getTime()));
    debug("Synchronized.");
    heartbeat();
    debug("Initial heartbeat triggered.");

    // ? setInterval() can theorhetically drift. Should we use something like sleepSync() for the heartbeat for more precision?
    setInterval(heartbeat, 60000); // we want to run the heartbeat function every 60 seconds, like a cron job.
    debug("Heartbeat started, polling every 60 seconds.");
    break;

  default:
    console.log("There was an invalid option supplied.");
    console.log(`"${Deno.args[0]}"`);
    close();
    break;
}
