import assert from "node:assert/strict";
import { presentEmailBody, sortEmailMessagesChronologically, splitEmailBody } from "../src/lib/emailThread.ts";

const johnReply = `Hi,

RUB processing is possible but fees are on an "on demand" basis only.

Thanks,
John

On Sat, Sep 26, 2026 at 4:01 PM Borys Kononenko <bizdev@offerpsp.com> wrote:

> Hi John,
>
> Thank you — this is very interesting.`;

const splitJohnReply = splitEmailBody(johnReply);
assert.equal(splitJohnReply.currentText, `Hi,

RUB processing is possible but fees are on an "on demand" basis only.`);
assert.equal(splitJohnReply.signatureText, `Thanks,
John`);
assert.match(splitJohnReply.quotedText || "", /Thank you — this is very interesting/);
assert.doesNotMatch(splitJohnReply.quotedText || "", /^>/m);

const forwarded = splitEmailBody(`Current answer.

-----Original Message-----
From: partner@example.com
To: bizdev@offerpsp.com
Subject: Terms
Old message`);
assert.equal(forwarded.currentText, "Current answer.");
assert.match(forwarded.quotedText || "", /Old message/);

assert.deepEqual(splitEmailBody("A complete standalone message."), {
  currentText: "A complete standalone message.",
  quotedText: null,
  signatureText: null,
});

assert.deepEqual(splitEmailBody("> quoted-only message"), {
  currentText: "> quoted-only message",
  quotedText: null,
  signatureText: null,
});

const sorted = sortEmailMessagesChronologically([
  { id: "new", received_at: "2026-09-27T20:55:05Z", created_at: "2026-09-27T20:55:05Z" },
  { id: "old", sent_at: "2026-08-17T09:09:48Z", created_at: "2026-08-17T09:09:45Z" },
]);
assert.deepEqual(sorted.map((message) => message.id), ["old", "new"]);

const trustlyNewsletter = presentEmailBody(`See you at booth E611
https://explore.trustly.com/e/730493/2026-09-28/4dqyn7/2689550868/h/long-token
View in browser
https://explore.trustly.com/webmail/730493/2689550868/long-token

We’re here. Meet for a coffee?
SBC Lisbon is underway.
Find us at Booth #E611.

or Unsubscribe
https://explore.trustly.com/unsubscribeConfirm/730493/long-token
© 2026 Trustly. All rights reserved.`);
assert.equal(trustlyNewsletter.contentText, `See you at booth E611

We’re here. Meet for a coffee?
SBC Lisbon is underway.
Find us at Booth #E611.`);
assert.equal(trustlyNewsletter.technicalLineCount, 6);
assert.match(trustlyNewsletter.technicalText || "", /unsubscribeConfirm/);
assert.doesNotMatch(trustlyNewsletter.contentText, /https:\/\//);

process.stdout.write("PASS email ordering, quoted-history folding and technical-tail cleanup\n");
