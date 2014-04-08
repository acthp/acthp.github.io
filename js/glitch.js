jQuery(function () {
    var $ = jQuery;
    var fj = flapjax;

    // Scenario 1:
    // You want to write a module that takes two observables. The
    // module should be reusable, and so should not have deep
    // knowledge of how the observables are contructed, i.e. if
    // they are related.

    // For the sake of simplicity, assume the module merely
    // subtracts two values. Maybe the first observable is
    // a stream of floats, the second is the mean of the stream
    // of floats, and you apply the "diff" module to get a
    // mean-normalized stream of floats.

    // In a different application, the first observable is a
    // stream of stock prices, the second observable is a buy
    // price, and you apply the diff module to get the profit
    // per share.


    // Scenario 2:
    // You want to skip an expensive computation if its inputs
    // have not changed. Downstream modules should handle
    // updates correctly whether or not it updates.

    // Scenario 3:
    // You are doing ajax fetches, which are usually asynchronous,
    // however the browser can cache them, in what case they are
    // synchronous. Downstream modules should handle both situations.

    // Scenario 4:
    // You are using MVC design patterns, and find that your
    // render routine is being called 10x more often than
    // necessary.


    // FRP
    //
    (function() {
        // Module that takes two observables and returns the difference.
        var diff = function (ob1, ob2) {
            var a = fj.startsWith(ob1, NaN);
            var b = fj.startsWith(ob2, NaN);
            return fj.liftB(function (a, b) { return a - b; }, a, b).changes();
        };

        // Combine two arrays that update asynchronously
        (function() {
            var sell = fj.receiverE();
            var buy = fj.receiverE();
            diff(sell, buy).mapE(function (profit) {
                $('#fj1').append(profit.toString() + (profit > 5 ? " buy now" : "")).append($('<br>'));
            });
            buy.sendEvent(10);
            sell.sendEvent(12);
            buy.sendEvent(11);
            sell.sendEvent(14);
            buy.sendEvent(8);
        }());

        // Combine two arrays that update synchronously
        (function() {
            var values = fj.receiverE();
            var avg = fj.mapE((function () {
                var count = 0, sum = 0;
                return function (v) {
                    count += 1;
                    sum += v;
                    return sum / count;
                };
            }()), values);
            diff(values, avg).mapE(function (v) {
                $('#fj2').append(v.toString()).append($('<br>'));
            });
            values.sendEvent(4);
            values.sendEvent(5);
            values.sendEvent(7);
            values.sendEvent(12);
        }());

        // Combine two arrays that update synchronously or asynchronously
        (function() {
            var a = fj.receiverE();
            var b = a.filterRepeatsE().mapE(function (v) { return  Math.abs(v); });
            diff(a, b).mapE(function (v) {
                $('#fj3').append(v.toString()).append($('<br>'));
            });
            b.mapE(function (v) {
                $('#fj4').append(v.toString()).append($('<br>'));
            });

            a.sendEvent(5);
            a.sendEvent(-10);
            a.sendEvent(-10);
            a.sendEvent(12);
        }());

    }());


    // MVC
    (function() {
        var diff = function (amodel, bmodel) {
            var a = NaN, b = NaN;
            var d = new (Backbone.Model.extend({
                update: function () { this.set('value', a - b); }
            }))({value: undefined});
            amodel.on('change', function (m) { a = m.get('value'); d.update(); });
            bmodel.on('change', function (m) { b = m.get('value'); d.update(); });
            return d;
        }

        var a = new Backbone.Model({value:NaN});
        var b = new Backbone.Model({value:NaN});
        var d = diff(a, b);
        d.on('change', function (m) {
            var p = m.get('value'),
                txt = p;
            if (p > 5) {
                txt += ' buy now';
            }
            $('#bb1').html($('#bb1').html() + txt + '<br>');
        });
        b.set({value:10});
        a.set({value:12});
        b.set({value:11});
        a.set({value:14});
        b.set({value:8});

        function mean(fmodel) {
            var sum = 0, count = 0;
            var avg = new (Backbone.Model.extend({
                update: function () { this.set('value', sum / count); }
            }))({value: NaN});
            fmodel.on('change', function (m) { sum += m.get('value'); count++; avg.update(); });
            return avg;
        }

        var seq = new Backbone.Model({value:NaN});
        var mn = diff(seq, mean(seq));
        mn.on('change', function (m) {
            $('#bb2').html($('#bb2').html() + m.get('value') + '<br>');
        });
        seq.set({value:4});
        seq.set({value:5});
        seq.set({value:7});
        seq.set({value:12});
    }());

    // Rx
    (function () {
        var diff = function (obsa, obsb) {
            return obsa.combineLatest(obsb, function (a, b) { return a - b; });
        };
        var diff2 = function (obsa, obsb) {
            return obsb.combineLatest(obsa, function (b, a) { return a - b; });
        };
        (function() {
            var values = new Rx.Subject();
            var avg = values.select((function () {
                var count = 0, sum = 0;
                return function (v) {
                    count += 1;
                    sum += v;
                    return sum / count;
                };
            }()));
            diff(values, avg).subscribe(function (v) {
                $('#rx1').append(v.toString()).append($('<br>'));
            });
            values.onNext(4);
            values.onNext(5);
            values.onNext(7);
            values.onNext(12);
        }());
        (function() {
            var values = new Rx.Subject();
            var avg = values.select((function () {
                var count = 0, sum = 0;
                return function (v) {
                    count += 1;
                    sum += v;
                    return sum / count;
                };
            }()));
            diff2(values, avg).subscribe(function (v) {
                $('#rx2').append(v.toString()).append($('<br>'));
            });
            values.onNext(4);
            values.onNext(5);
            values.onNext(7);
            values.onNext(12);
        }())
    }());

});
