---
layout: post
title:  "Cursors and lenses"
date:   2015-04-24 10:51:58
categories: clojure om lenses
---

# Misunderstanding lenses and cursors

At Clojure/West this year Brandon Bloom gave a [talk](https://www.youtube.com/watch?v=LNtQPSUi1iQ)
about Om, during which he complained of spurious dependencies between modules that are
caused by Om's "global immutable state" pattern. Different modules, for example, have to
agree about where data lives in the state object.

This sounded familiar, from my abortive experiments with using cursors. A
trivial example might be a pair, which could be stored either as `[first last]`
or as `{:first first :last last}`. With cursors, all modules operating on this data have to
agree on the shape. A module written to operate on a cursor to a vector won't be
able to update the map version.

It gets much worse as your data grows deeper, since your
modules have to know about the paths into those structures, even when those
paths are not relevant to the module. For example, if a module needs data
paths `[:a :b :c :d]` and `[:a :e :f]`, you have to pass it the
common parent path, `[:a]`, and wire into the module the paths `[:b :c :d]`
and `[:e :f]`.
Module reuse also becomes hard, because the
shape of the state structure may be different in the second application of
an existing module.

But none of this is a consquence of "global immutable state". It's a consequence of
using cursors, which provide very limited abstraction of that state. If you use
lenses instead, all of this goes away. Critically, lenses are composable, and
can perform arbitrary transforms,
such as converting an array to a map, or passing data from different parts of the
parent structure. With lenses, modules don't need to know **anything** about where or how
data is stored in the global state structure.

While talking nonsense on this subject
at Clojure/West, someone complained when I referred them to the haskell
literature on lenses.
 I rashly replied that a lens implemention in clojure should
be about fifteen lines of code. Turns out it was closer to eighteen.

https://github.com/acthp/lens/blob/master/src/lens/core.clj

*I'm expecting a haskeller to email me any second telling me I've done
it all wrong, which is almost certainly true. I interpret haskell by
fruitlessly staring at code, playing in the compiler for a bit, then
finding a clojure or javascript port written by someone else. So this
is a clojure port of my javascript over-simplification of someone else's javascript
port of one of haskell's lens libraries. I'm sure there's an existing clojure
lens library that does it all correctly.*

The tests includes an example of a trivial component which updates global
state by performing a mean normalization. You can pretend it's running
asynchronously in response to user input, but in the test it's just a
synchronous function call.

https://github.com/acthp/lens/blob/master/test/lens/core_test.clj

I don't believe lenses address Brandon's other complaint, which
had to do with the problem of combining async and view code, as you
would do if you directly bound an event handler to a cursor update. His
architecture diagram moved async ops out of the views, via queues,
and looked a tiny bit like flux.
