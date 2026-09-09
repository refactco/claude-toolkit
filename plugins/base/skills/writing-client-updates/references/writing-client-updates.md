# Writing a client update on a task or issue

This guide is for any developer or designer at Refact who needs to send a client an update while a task is in flight or just after it has been completed. It is not for big formal reports. It is for the kind of message where a client has asked what is happening, or where something needs to be communicated proactively, and the answer needs to be clear, structured, and confident.

## What a good update does

A client reading your update should come away knowing four things without having to ask follow up questions. They should know where things stand right now, what we found when we looked into it, what they need to do if anything, and what we are doing next. Everything else is supporting detail.

## Pre-draft fact check

Run this before you write a word of the draft. It is a check on your notes, not a part of the message. Nothing in this section is meant to end up in the update as extra text, so it does not compete with the length guidance below.

### Confirm the recipient before you name them

Find the client contact in project memory and use the name and the role it gives. Do not take a name from a chat message, a commit, an email address, or your own recollection of the account. If project memory names no contact, ask who the update is for. Do not guess a first name, and do not address someone who was only mentioned in passing. A greeting to a person who does not exist undoes the confidence the rest of the message is trying to build.

### State only what the source says, and mark the rest

Every fact, name, number, date, URL, quote, and contract clause in the draft must appear in the source material you were given: the notes, the transcript, the ticket, the document, or a file you opened. If it is not there, do one of two things. Leave it out, or mark it as an assumption in the same sentence with a few words such as "we believe" or "this looks like". Never present an inference as a checked fact, and never attribute a claim to a person unless that person actually said it in the source.

Keep the marking short. If being honest about an unverified claim would take a paragraph of hedging, the claim is not ready to send. Cut it, and say what you will confirm and when. That is shorter than the hedge and more useful to the client.

Read the whole source, not the first claim in it. When someone points you at a handoff document, a report, or a pull request, check every factual claim in it before you draft from it. Checking only the claim the person named first is how a real error survives into the client's inbox and the client finds it for you.

Status words are facts too. A pull request that is only open is open. Do not call it merged, deployed, on staging, or released. Write "the fix is in review as a pull request" rather than "the fix is heading to staging" when nothing has been merged. The same rule applies to anything else that has a state, such as an invoice, an access request, or a ticket.

### Confirm who asked for this work before you choose the opening

Ask one question before you write the headline: did the client raise this, or did we find it ourselves? The answer changes the first sentence.

- The client raised it. Answer their question in the headline. "The search bar is working again as of this morning."
- We found it ourselves. Say that we found it, then say where it stands. "While reviewing the caching layer we found that search results were being served from a stale cache. That is fixed as of this morning."

Framing our own finding as something the client asked for reads as an answer to a question they never asked, and it usually forces a full rewrite once someone notices.

Check who the message is really for as well. A request to prepare something for a colleague to send on a ticket is an internal message, not a client update, and it opens differently. If the notes do not tell you which case you are in, ask.

## Match the length to the update

Let the update earn its length. A short, simple situation gets a short update. A complex one gets a longer one. The structure below is a checklist of what to consider, not a set of sections you must all fill. If a step has nothing real behind it, leave it out rather than padding it with filler. A two sentence message that fully answers the client is a success, not an incomplete one. Never stretch a small update into a long report to make it look thorough, and never invent detail the raw notes do not contain. When in doubt, err on the side of shorter.

## Tone

The voice is warm, professional, calm, and firm. It comes from someone who has investigated the situation thoroughly and knows what they are talking about. It does not apologize reflexively. It does not hedge with weak qualifiers like “I think” or “maybe” when you actually do know. It does not bury bad news, and it does not dramatize good news. When something has gone wrong, you explain the root cause plainly and move directly to what we are doing about it.

Use first names. Write in full sentences. Avoid corporate filler like “circle back,” “touch base,” or “as per our discussion.” Do not use em dashes anywhere.

## The structure

Reorganize whatever raw notes you have into this order. The order is deliberately not the order in which you investigated the problem. It is the order that gives the client what they need fastest. Not every update needs every step. Include the steps that carry real information for this update and skip the ones that do not apply.

**1. The headline.** One or two sentences at the top that tell the client where things stand right now. Is the issue resolved, in progress, blocked, or waiting on a decision? Lead with the state of things, not the history. If the answer is “fixed and deployed,” say so in the first sentence. If the answer is “still investigating,” say so in the first sentence.

**2. What we looked at and what we found.** A short paragraph that explains the investigation in plain language. Skip the dead ends and the internal back and forth. Tell them what mattered. If the cause is not yet clear, say what you have ruled out and what you are looking at next.

**3. The root cause, if there is one.** Explain it in language a non technical client can follow. If the problem was a misconfigured plugin, say that, then say what the plugin was doing and why it was causing the symptom they reported. Clients gain confidence when they understand the why, not just the what.

**4. What we have done so far.** If anything is already shipped, fixed, or changed, describe it briefly. Mention where it is live and how the client can verify it if that is useful.

**5. What we need from you, if anything.** Include this step only when there is a real ask. When there is one, make it a clear, named ask. One thing, not three. If you need a decision, frame the options. If you need access, say what you need and how to share it. If there is nothing for the client to do, leave this step out entirely. Do not add a line telling them there is nothing to do or reassuring them they need not act. Its absence already says that, and the message is shorter and calmer without it.

**6. What we are doing next.** Concrete next steps from our side, with rough timing if you can give it. Use early, mid, or late framing when an exact date is not possible. For example, “We expect to have this ready for your review in the early part of next week.” Avoid internal risk language and avoid promising dates you are not confident in.

**7. Close.** One short line. Offer to answer questions, confirm next contact point, or simply sign off. Do not pad the close with apologies or thank yous that you did not earn.

## Style rules

Lead with the answer, not the history of the investigation. The client cares less about how you got there than where you arrived. The investigation summary belongs in step two, not step one.

Frame delays and changes as deliberate decisions that benefit the client. If a fix is taking longer because you found a deeper issue worth addressing, say that. Do not open with an apology that frames the extra care as a problem.

Keep internal detail internal. The client does not need to know which developer was on call, what your sprint board looks like, or which dependency surprised you. They need to know what it means for them.

Be specific. “We rebuilt the import pipeline so that future migrations will not need a manual cleanup pass” is more useful than “We made improvements to the import process.”

When you do not know something, say so directly. “We have not yet confirmed whether this affected any published posts. We will know by the end of the day and will follow up.” That sentence is calmer and more professional than guessing.

## Email updates versus Slack updates

The seven part structure above is the full form. It maps directly onto email. Slack is a different medium with different conventions, and a Slack update should not read like an email pasted into a channel.

### Email

Email is for updates that the client will want to come back to, forward internally, or treat as a record of where things stand. Use the full structure. Reply within the existing thread when one exists rather than starting a new one, so the client can scroll back through the history of the issue without searching. Give the message a clear subject line if you are starting fresh, written from the client’s point of view rather than ours. “Search bar fix and follow up” is better than “Update from Refact.”

Open with a brief greeting using the client’s first name. Sign off with your own first name. Keep paragraphs short, two to four sentences each, with a blank line between them. Do not use bullet points in the body unless you are listing genuinely list shaped content like decision options or files to review. Prose reads warmer than bullets and matches the tone we want clients to associate with us.

When the update is significant, do not bury the headline in paragraph three. The first sentence of the email should tell the client where things stand. The rest of the email is the supporting case for that sentence.

### Slack

Slack is for updates inside an active working relationship where context is already shared. The principles are the same, but the form is much tighter. You can usually drop the greeting, drop the sign off, and drop any framing that the channel already provides.

A good Slack update is short, conversational, and structured around the same headline first principle. Start with the state of things in one sentence. Add one or two sentences of substance underneath. If there is an ask, put it on its own line so it is impossible to miss. If there is a next step from us, name it and give rough timing.

For a quick fix or a routine update, one short message is enough. For anything with more substance, post the headline in the channel as the parent message and put the detail in the thread. That keeps the channel readable for everyone else while giving the primary contact the full picture when they click in.

Avoid stacking many short messages in a row. One message that says everything is easier to read, easier to react to, and easier to search later than five messages sent over two minutes. If you find yourself about to send a fifth message, write a single replacement message instead.

Use threads for back and forth. When the client replies in the main channel rather than in the thread, gently bring the conversation back into the thread by replying there yourself. It keeps the surface of the channel calm.

A Slack update can be casual in register without being casual in substance. “Hey, the search bar is back up. It was a stale cache, we cleared it and added a check so it does not happen again on future deploys.” That message is short, friendly, and complete. It hits the headline, the root cause, and the action we took, in that order. There was nothing for the client to do, so it does not raise the subject at all.

### When in doubt about channel

If the update involves a root cause that touches sensitive areas like billing, scope, security, or anything the client may want to forward internally, use email even if the conversation has been on Slack. Email creates a record and gives the client something they can share without screenshotting a chat. If the update is operational and routine and the client lives in Slack, Slack is the right channel and an email would feel heavier than the moment calls for.

## A short example

Here is the same update written two ways. The first version is what an investigation often looks like when written in the order it happened. The second is the same content rewritten in the order the client needs.

**Less good.** “Hi Ben, so when we got your message about the search bar this morning, we first checked the theme files, then we looked at the search plugin, then we tested on staging, then we found that the issue was actually in the caching layer, and we have now cleared the cache and it seems to be working. Let me know if you see anything else.”

**Better.** “Hi Ben, the search bar is working again as of this morning. The cause was a stale cache that was serving an older version of the search template, which is why the results looked broken even though the underlying data was correct. We cleared the affected cache layer and confirmed that searches are returning expected results across the site. We are going to add a check to our deployment process so that this particular cache is cleared automatically on future releases, and we will have that in place by the middle of next week. Happy to walk through any of this if useful.”

The second version puts the client in the picture in the first sentence, explains the why in plain language, names what we did, and tells them what we are doing to prevent it. There was nothing for the client to do, so it does not raise the subject at all. The total length is similar. The clarity is not.

-----

Version 1.0. This guide will grow over time as we gather real examples from active client work. When you see an update that did this well or one that missed, share it with Parnia and it will go into the next revision.