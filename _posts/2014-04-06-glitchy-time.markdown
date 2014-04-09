---
layout: post
title:  "Glitchy time, with Rx"
date:   2014-04-06 18:25:51
categories: rx glitchy
---

<script src="//ajax.googleapis.com/ajax/libs/jquery/1.11.0/jquery.min.js"></script>
<script src='/js/underscore-min.js'></script>
<script src='/js/backbone-min.js'></script>
<script src='/js/flapjax-2.1.js'></script>
<script src='/js/rx.js'></script>
<script src='/js/glitch.js'></script>

# Part 1: MVC and Observer pattern
Imagine you're a front-end developer. You're building a large application on a common asynchronous platform like, say,
the browser. You have a few files full of callbacks, and the site is looking good, but as it grows you find the
code lacks structure. It's becoming harder both to add features, and to keep different parts of the UI in sync.
So, you turn to the go-to solution for managing
async front-end code: model-view-controller (MVC).

MVC has been a popular UI design pattern for a few decades. At its heart is the observer pattern, which is a way for
some object, the observable, to asynchronously notify other objects, the observers, of any changes that occur. This
allows you to start breaking your files up into small, reusable modules, and to keep different parts
of the UI in sync.

Your APIs now take and return observables.
For example, you might have a module that listens to two observable floating point numbers and returns the difference
as an observable.
This is an unrealistically small example for the sake of illustration.
Subtraction stands in here for code of enough complexity that it
makes sense to put it in a module for reuse.

So you have your subtraction module. Maybe you're tracking an
observable sell price and an observable buy price, and you drop in your difference module to get an observable
profit.

Here's the module, using backbonejs, a popular MVC library.

{% highlight js %}
var diff = function (amodel, bmodel) {
    var a = NaN, b = NaN;
    var d = new (Backbone.Model.extend({
        update: function () { this.set('value', a - b); }
    }))({value: NaN});
    amodel.on('change', function (m) { a = m.get('value'); d.update(); });
    bmodel.on('change', function (m) { b = m.get('value'); d.update(); });
    return d;
}
{% endhighlight %}

Perhaps you have an observer telling you when to buy.

{% highlight js %}
diff(sellPrice, buyPrice).on('change', function (m) {
    var p = m.get('value');
    console.log(p);
    if (p > 5) { console.log('buy now'); }
});
{% endhighlight %}

If we now have two sequences like (time moving to the right)

    Buy  -10----11-------8
    Sell ----12-------14--
    
you expect to get an alarm when the 8 arrives on Buy. Here's
the output from this sequence:


<p id='bb1' style='background-color:#EEEEEE'>
</p>


Great. By the way, all the example outputs are generated with live code, so
pop open the sources for the details.

Soon you have another application for the diff module. You need to mean-normalize a sequence of floats, i.e.
subtract the running mean from each value. A sequence like

    4----5----7----12

would be become

    0---0.5--1.66--5

That is, the average of 4 is 4. Subtracting 4 from 4 gives 0. The average of 4 and 5 is 4.5. Subtracting
4.5 from 5 gives 0.5, and so-forth.

So, you code up the mean observable

{% highlight js %}
function mean(fmodel) {
    var sum = 0, count = 0;
    var avg = new (Backbone.Model.extend({
        update: function () { this.set('value', sum / count); }
    }))({value: NaN});
    fmodel.on('change', function (m) { sum += m.get('value'); count++; avg.update(); });
    return avg;
}
{% endhighlight %}

create a mean-normalized observable

{% highlight js %}
var seq = new Backbone.Model({value:NaN});
var mn = diff(seq, mean(seq));
{% endhighlight %}

pass in the sequence [4, 5, 7, 12], and get the following:

<p id='bb2' style='background-color:#EEEEEE'>
</p>

## Glitch

Wait, what just happened? There are nearly twice as many numbers in the output sequence as
in the input sequence, and the extra values are incorrect! In fact, every other
number in the output sequence is junk. If you spend some time in the debugger you'll
find that the trouble is that the update of ```mean(seq)``` propagated to ```diff``` before
the update of ```seq```.
In the third update the ```diff``` module finds ```mean(seq)``` is 4.5 but ```seq``` is still 4, so
it outputs -0.5. For reasons to be explained later, this behavior is called a "glitch".
The first point of this post is **observer pattern is glitchy**.

What to do with this?
There are some poor workarounds you can try. Sometimes there is an invariant that
can be used to filter the output sequence. For example, if it were two arrays instead
of two numbers getting
out of sync, the glitchy states might be the only ones where
the arrays have different lengths. In that case, you can filter the glitches on
```a.length !== b.length```.
In the case of ```diff``` there's no invariant, so you have to use worse hacks, like
dropping the odd-numbered updates to ```mn```. 

But, wait: that breaks the first use case for ```diff```. We're now throwing out half the
real data in the buy/sell comparison.  We now need two versions of ```diff```, each
with deep knowledge of its callers so it can know whether to discard half the values. Your
APIs no longer take observables. They take observables constructed in a very
specific way. If your module takes more than two observables, you get a fun
combinatoric expansion of the number of versions you need to handle the possible
inputs.

It gets worse. More frequently, you don't actually know whether multiple observables will
update in unison or not, because of caching. When you make ajax requests the browser may or
may not have a cached version. If it's cached, any downstream observables will update
at the same time as the event that caused the request. If it's not cached, it won't.

If you have expensive calculations, sorting for example, you may need to cache them
yourself and only update the observable when necessary. Further, many MVC frameworks
(including backbonejs) behave this way by default, only pushing new values to
observers if the values have changed since the last update.

So, in fact, you can't easily write a general purpose ```diff``` method without
spending a lot of time working around glitchy states. 

Some variation on this bug is a rite of passage for users of MVC libraries. It
manifests in different ways. Here, it's an incorrect sequence of numbers, but it will
also show up as mismatched arrays, missing attributes, and so-forth, many of which
will throw run-time exceptions. Your code evolves to be liberally sprinkled with
data consistently checks. Composing modules becomes arduous, and you're never
sure if you've exercised every code path that might leave you with inconsisent data
in some callback.

The number of glitchy
states increases quickly with the number of observables in the system, depending on how
they are connected. In the following example,


{% highlight js %}
var a = fn1(obs1);
var b = fn2(a, obs1);
var c = fn3(b, obs1);
var d = fn4(b, c);
{% endhighlight %}

a single update in ```a``` results in two updates in ```b```, three updates in ```c```,
and five updates in ```d```, four of which are junk.  In UIs, the eventual observers
in the system are
generally renderers. Glitches mean you end up rendering a lot more often than you might
think, killing your performance.
Any moderately-sized system built on observer pattern
spends most of its time calculating meaningless, glitchy states. You sometimes see
this in off-the-shelf widget libraries, before you've written even a line of
application code.
Put breakpoints on the render methods, or spend some time in the chrome
profiling tools, and you may be surprised how many renders are caused by
a single mouse click, or mouse move.

*It's worth noting here that the reactjs library has an interesting partial solution
to this problem: it disconnects model updates from DOM updates, and essentially
updates the DOM periodically by polling the model. This eliminates much of the cost
of computing glitchy states (the DOM update time), but doesn't avoid calculating them
in the first place, doesn't help with avoiding run-time exceptions due to
inconsistent data, and doesn't help with other expensive computations you may need
to do in the client.*


# Part 2: Functional Reactive Programming

Thankfully, there's a solution. There's an existing body of literature on the
idea of Functional Reactive Programming, which describes this problem, and its
solution. The root of the problem, they say, is that the system has no
coherent model of time. Observer pattern walks through a list of callbacks
notifying observers *in the order in which they subscribed to the observerable*,
(or the reverse order)
which is an artifact of implementation, having nothing to do with either the flow of
time, or the observer pattern abstraction. In other words, **observer pattern is a
leaky abstraction**.
This leads to callbacks being invoked with data
that is mismatched in time, which they call *glitches*. If your
callback, ```mycallback(obs1, obs2)``` is called with a value of obs1 from an event
that arrived at t1 but a value of obs2 from an event that arrived at t2, you have
a glitch. Or, another way to think about it is that a single event entering the
system should invoke a given callback at most one time. If it invokes a callback
multiple times, it's essentially inventing "in between" times that are
meaningless.

The solution is to explicitly model the flow of time in the system. An FRP
system only invokes callbacks with values matched in time, by invoking the
callbacks in the correct order. 

flapjax.js is an example of this. What happens if we reimplement ```diff``` with FRP?
Here's our flapjax ```diff``` module.


{% highlight js %}
var diff = function (ob1, ob2) {
    var a = fj.startsWith(ob1, NaN);
    var b = fj.startsWith(ob2, NaN);
    return fj.liftB(function (a, b) { return a - b; }, a, b).changes();
};
{% endhighlight %}

Applying it to the buy/sell calculation:

<p id='fj1' style='background-color:#EEEEEE'>
</p>

Good so far. Applying it to mean normalization:

<p id='fj2' style='background-color:#EEEEEE'>
</p>

Perfect. Note that we didn't have to modify the module, and the module has
no deep knowledge of how the observables were created.  This is a truly
reusable and composable code module.

How about the case where we don't know if the observable will update? Just
for demonstration, let's diff the value and its absolute value. Imagine here
that instead of absolute value we are doing some large computation that we
only want to repeat when necessary. We filter repeated input values to avoid
recalculation.

{% highlight js %}
var a = fj.receiverE();
var b = a.filterRepeatsE().mapE(function (v) { return  Math.abs(v); });
diff(a, b)
{% endhighlight %}

Now ```diff``` doesn't know if ```b``` will update conincidentally with ```a```. We
input the sequence ```[5, -10, -10, 12]```. Here's the result:


<p id='fj3' style='background-color:#EEEEEE'>
</p>


Perfect. Just to verify that ```b``` is not updating every time, here's a log
of the values from ```b```:

<p id='fj4' style='background-color:#EEEEEE'>
</p>

Having a coherent model of time means we can safely compose streams of events using
functional combinators, much like we do in our synchronous code. Hence the term
*functional reactive programming*. Our functions are guaranteed to only see
data that is coherent in time.

# Part 3: Rx

So far I haven't said a word about Rx. This is a post about Rx.

Rx is a library from Microsoft that they bill as Reactive Programming, and
say is built on observer pattern (*urk?*). If you
look at the methods in the library, it looks a lot like FRP. Netflix has ported
it to java, and they use it in their client code as well. They've been giving a lot
of presentations on the subject, billing it as *Functional* Reactive Programming.
The library is very actively developed, has hooks for just about any
framework you'd want to use, and is available on every platform in existence,
minus epsilon.

So, let's give Rx a spin on the mean normalize problem. Here's the ```diff``` module.

{% highlight js %}
var diff = function (obsa, obsb) {
    return obsa.combineLatest(obsb, function (a, b) { return a - b; });
};
{% endhighlight %}

<p id='rx1' style='background-color:#EEEEEE'>
</p>


Ack! Glitches! Rx looks like FRP, but with all the bugs added back in!
It's not quite the same
sequence of glitches as before, because as noted *observer pattern is a leaky
abstraction*. The values you get out of the stream depend not on the
abstraction, but on the details of the implementation. In this case Rx behaves
differently than backbone. If we change the order of subscriptions in the
```diff``` function, we can get the backbone behavior:

{% highlight js %}
var diff2 = function (obsa, obsb) {
    return obsb.combineLatest(obsa, function (b, a) { return a - b; });
};
{% endhighlight %}

<p id='rx2' style='background-color:#EEEEEE'>
</p>

The actual streams created with observer pattern depend not only
on details of the observable library implementation, but on details of your application's
implementation as well. The *abstraction* says observable ```A``` has
listeners ```B``` and ```C```, but the implementation says observable ```A``` has
listeners ```B0``` and ```C1```, or listeners ```B1``` and ```C0```, where the
integers reflect the order of callback invocation, and these two
systems behave differently. Which system you end up with depends on
the combination of your library and your application code.

## Solutions?

If you ask about the mean normalize example in various Rx places, the standard
answer is "Use ```zip``` instead of ```combineLatest```". ```zip``` is like
dropping the odd-numbered updates.  It works for this case, but it breaks the
buy/sell example. You again have a combinatoric expansion of versions, or glue code as the
number of observable parameters increases. And it doesn't work
in the more typical case, when you don't know if the observable will update.

The problems get worse when you start trying to use Rx observables in
larger expressions, because you don't know what state any of the
observables will be in when your callbacks are invoked, without
deep-diving into the implementations of every method.

I've been asking the Rx team about these issue, but so far they
don't seem to have understood the questions. So, this post is
an attempt to spell it all out, with code examples.

I won't be at all surprised if the answer is "You're doing it wrong." I know
Microsoft and Netflix have better engineers than me designing their
platforms. But so far I'm not getting it.
One former Microsoft engineer who worked heavily on Rx wrote to me
"You will never hear me make a comparison between Rx and FRP." That's great, but
I still don't know what problem Rx is trying to solve that FRP doesn't do
better, or how to use it
without dying in inconsistent data.

So I'm left with these questions.

**Hey, Netflix! Can you stop calling this FRP, already?**

**Why do we want to go back to glitchy time?**

**How do you work around all the glitches, without wasting tons of developer time?**

**How do you reason about Rx combinators, given all the glitches?**

**How do you write the ```diff``` module to work in the three cases, above?**

I would also say to the Rx devs: **making flapjax and bacon bindings for Rx will not make Rx
behave like flapjax or bacon**. If you try to use Rx like an FRP library, you
will have bad results.
