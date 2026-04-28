---
title: "Using deterministic output to squeeze value out of AI"
date: 2026-04-28
tags: [ai, engineering, product]
excerpt: "Why AI thrives in software engineering but struggles elsewhere — and how deterministic output is the key to changing that."
draft: false
---

I've recently been trying to figure out how to get AI to work well in non-software engineering use cases. I find that when AI is used to create documentation, design docs, or PRDs, the output is often way too verbose and not very human-readable. It finds itself in this weird middle ground where it's not great at either. After making alterations or passing it back and forth in the engineering pipeline, things get lost in transit. A lot of the organizational structures break down.

So why is AI so powerful in software engineering, and so hard to get working in other contexts?

I believe there's one key element that makes software engineering where AI delivers clear value, and it comes down to one phrase: deterministic output.

## What Is Deterministic Output?

Deterministic output can be considered like a funnel. You put things in at the top and it comes out in a succinct, uniform output. The purest sense of this is something being 'true' or 'false'.

In software engineering, when you write code, you can create tests that either work or they don't. You can hit your endpoint, click a button, or browse the UI and it's usually pretty clear whether the happy path works or not. Obviously there are nuances. Edge cases, bugs, poorly written code, bad design patterns, and lots of other things that need to be considered in this category.

But that's not the point of this blog post.

In writing, sales, product design, and almost all other professions we don't have the luxury of unit tests.

So how do we overcome this tricky hurdle?

## A Product Design Example

Let's take an example in product design.

The issue I run into when creating product design, design docs or engineering docs is twofold: how fast everything gets out of sync, and how difficult it is to balance verbosity. This is difficult because we write and speak with nuance. We frame things in ways that our reader wants to read and hear. But we are no longer writing product design docs for humans to read. We are writing product design docs for humans to summarize with AI and skim read.

What the output should really be is a clear set of instructions focused on yeses and nos, as if they were unit tests. The structure of the product design should be oriented toward what an AI prompt is already structured like. In this way, you've essentially made the LLM the engine, and the product design doc as the criteria. That test validates an engineering design and/or the code being checked in. It can also be used as an artifact to create tasks (either for an LLM or human) to validate the implementation success.

## Applying This Across Domains

So how do you apply this principle across domains?

In all cases, the way we should be thinking: how do I synthesize something that is non-deterministic into something that is deterministic? How do I break down a complex question and put it in a state where it can be either true or false?

Test-driven development focuses on writing tests first, then writing code that validates those tests. We should orient our product design docs the same way. They should be written so they can be fed to an LLM as the initial context for checking whether something else is aligned with it. That, I believe, is the best path to gain value with AI in spaces outside of software engineering.
