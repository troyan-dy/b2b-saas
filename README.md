<p align="center">
  <a href="https://troyan-dy.github.io/b2b-saas/"><img src="docs/img/en/hero.webp" alt="B2B SaaS: build an AI startup with your own hands. Three cards are dealt — Voice AI, AI Tinder, for dental clinics — and together they make the pitch “Voice AI Tinder for dental clinics”. The savings are $3,578 and burn at $10 per second" width="100%"></a>
</p>

<p align="center"><b>English</b> · <a href="README.ru.md">Русский</a></p>

<p align="center">
  <a href="https://troyan-dy.github.io/b2b-saas/"><img src="https://img.shields.io/badge/%E2%96%B6%20play-in%20the%20browser-d97757?style=for-the-badge&labelColor=262624" alt="Play in the browser"></a>
  <img src="https://img.shields.io/badge/one%20startup-16%20minutes-3f7d58?style=for-the-badge&labelColor=262624" alt="One startup takes 16 minutes">
  <img src="https://img.shields.io/badge/team-1%20human%20%2B%20Claude-f0eee6?style=for-the-badge&labelColor=262624" alt="The team: one human and Claude">
</p>

# B2B SaaS

A tycoon about building an AI startup alone. The team is Claude. The money is yours, and it runs out in about six minutes.

**Play: https://troyan-dy.github.io/b2b-saas/**

## The pitch

1. Describe the startup in three words. “Voice AI Tinder for dental clinics” is a valid answer.
2. Put a Claude wrapper on the blueprint. Add a landing page. Remember about payments later than you should.
3. Turn a profit within 30 sprints. Or at least shut down gracefully and write a thread about it.

<p align="center"><img src="docs/img/en/loop.webp" alt="How it works: you pick blocks and review one lane; Claude’s agents build, fix and promote for money every second; finished blocks ship at the release; clients come for the landing page, wait for their block and leave without it; subscriptions come in, tokens, hosting, agents and rent go out. Three things kill a startup: tokens, tech debt and waiting clients" width="100%"></p>

## What it looks like

The idea is dealt in a terminal. The startup itself is a paper blueprint: the product in the middle, the founder and the agents on the left, the clients on the right, every dollar per second in plain sight.

<table>
  <tr>
    <td width="50%"><img src="docs/img/en/1-idea.webp" alt="The idea: three cards to choose from"><br><sub><b>1 · The idea.</b> Three decks, three cards from each: what kind of AI, what it is like, who pays for it.</sub></td>
    <td width="50%"><img src="docs/img/en/2-kitchen.webp" alt="The kitchen: the first blocks on the blueprint"><br><sub><b>2 · The kitchen.</b> One founder, one fast agent, an empty blueprint. Claude builds; you click to help.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/img/en/3-clients.webp" alt="First clients: the release card and the first buildings"><br><sub><b>3 · First clients.</b> A release every 32 seconds. Clients come, wait for the block they need and do not always say which one.</sub></td>
    <td><img src="docs/img/en/4-call.webp" alt="A call: a card with answers in the middle of the sheet"><br><sub><b>4 · A call.</b> Somebody always wants an answer: a client, a blogger, the press, a buyer, the bank. Every answer has a price.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/img/en/5-city.webp" alt="A city of clients: a full blueprint, a row of agents and a dozen clients"><br><sub><b>5 · A city of clients.</b> The blueprint is full, the agents cost more than rent, and procurement has sent a questionnaire.</sub></td>
    <td><img src="docs/img/en/6-ending.webp" alt="The ending: one big number and the founder’s post"><br><sub><b>6 · The ending.</b> One big number and a founder’s post. Then the same founder starts over, a little wiser.</sub></td>
  </tr>
</table>

<p align="center"><img src="docs/img/en/numbers.webp" alt="The game in numbers: 1 human on the team, 384 startups in three words, 20 product blocks, 30 tech debt before the product falls, 11 dilemmas with a price, 40 industry headlines, 214 questions in the vendor questionnaire. Four endings: bankruptcy, out of time, exit, profit — each one is a founder’s post" width="100%"></p>

## What is inside

- **Three kinds of agents.** Fast: lots of code, lots of debt. Regular: writes like a human, so-so. Thinking: slow, expensive, no debt.
- **Five kinds of clients.** Small business, chains, startups like yours, corporations, and one government client that will sign. Someday.
- **Calls.** “Do you have an API? We won’t do anything with it, but it has to exist.” Answer honestly and lose a quarter of the bill, or say “already in prod” and build it in two sprints.
- **Dilemmas.** Claude offers to delete the tests: they are blocking the release.
- **Demo days, trends, competitors and a model provider** that raises prices “due to increased value”.
- **A founder who stays.** Traits and lessons carry over to the next startup. Claude does not remember the last one. You will.

## Languages

English and Russian. The game takes the language of the browser; the last line of the menu switches it. `?lang=en` or `?lang=ru` in the address forces one.

## Build it yourself

```
npm install
npm run dev      # the game at http://localhost:5174/
npm run build    # the build in dist/
npm test         # formulas, saves, determinism
```

The pictures of this page are made from the game itself: `npm run build:gym && node tools/readme.mjs`.

Made with Phaser 4, TypeScript, Vite and ZzFX; the music is CC0 from OpenGameArt. Licences of everything third-party are in [public/LICENSES.txt](public/LICENSES.txt).

B2B SaaS is set in the world of [Yes-Driven Development](https://troyan-dy.github.io/yes-driven-development/) — the clicker where the human made exactly one decision. Here there are more of them, and that turns out to be the problem.

Author: [github.com/troyan-dy](https://github.com/troyan-dy).

The names Claude, Anthropic, Tinder, Uber, Excel and SAP are used as parody; the game is not affiliated with or endorsed by these companies.
