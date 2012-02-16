/*

Quicksand 1.2.2

Reorder and filter items with a nice shuffling animation.

Copyright (c) 2010 Jacek Galanciak (razorjack.net) and agilope.com
Big thanks for Piotr Petrus (riddle.pl) for deep code review and wonderful docs & demos.

Dual licensed under the MIT and GPL version 2 licenses.
http://github.com/jquery/jquery/blob/master/MIT-LICENSE.txt
http://github.com/jquery/jquery/blob/master/GPL-LICENSE.txt

Modified by Sean Micklethwaite (Trade Chase) for Knockout.js support and
to use CSS transforms (Feb 2012).

Project site: http://razorjack.net/quicksand
Github site: http://github.com/razorjack/quicksand

*/

(function ($) {
    var DEBUG = window.DEBUG;

    var cssTrans = window.Modernizr && window.Modernizr.csstransitions;
    var cssTransforms = window.Modernizr && window.Modernizr.csstransforms;
    var cssTransName = $.browser.webkit ? '-webkit-transition'
        : $.browser.mozilla ? 'MozTransition'
        : $.browser.opera ? 'OTransition'
        : $.browser.msie ? 'msTransition'
        : 'transition';
    var cssTransformName = $.browser.webkit ? '-webkit-transform'
        : $.browser.mozilla ? 'MozTransform'
        : $.browser.opera ? 'OTransform'
        : $.browser.msie ? 'msTransform'
        : 'transform';
    var cssTransformPropertyName = $.browser.webkit ? '-webkit-transform'
        : $.browser.mozilla ? '-moz-transform'
        : $.browser.opera ? '-o-transform'
        : $.browser.msie ? '-ms-transform'
        : 'transform';

    function removeToInsertLater(element) {
        var parentNode = element.parentNode;
        var nextSibling = element.nextSibling;
        parentNode.removeChild(element);
        return function () {
            if (nextSibling) {
                parentNode.insertBefore(element, nextSibling);
            } else {
                parentNode.appendChild(element);
            }
        };
    };

    var transform, setTransform, getTransform;
    if (cssTransforms) {
        transform = function (element, animation, d, e) {
            var origAnimation = element.data('quicksand-animation');
            if (origAnimation) {
                animation = $.extend({}, origAnimation, animation);
            }

            var trans = '';
            if ('left' in animation) {
                trans += ' translateX(' + animation.left + 'px)';
            }
            if ('top' in animation) {
                trans += ' translateY(' + animation.top + 'px)';
            }
            if ('scale' in animation) {
                trans += ' scale(' + animation.scale + ')';
            }
            trans = trans.trim();
            if (trans && trans != element[0].style[cssTransformName]) {
                element[0].style[cssTransName] = d ? cssTransformPropertyName + ' ' + (d / 1000) + 's ease-in-out' : 'all 0s';
                element[0].style[cssTransformName] = trans;
            }

            if ('opacity' in animation) {
                element.fadeTo(d, animation.opacity, e);
                delete animation.opacity;
            }

            element.data('quicksand-animation', animation);
        }
        setTransform = function (element, animation) {
            transform(element, animation, 0);
        }
        getTransform = function (element) {
            return element.data('quicksand-animation') || {};
        }
    } else {
        transform = function (element, animation, duration, easing) {
            element.stop(true, true).css('position', 'relative');
            element.animate(animation, duration, easing);
        }
        setTransform = function (element, animation) {
            animation.position = 'relative';
            element.stop(true, true).css(animation);
        }
        getTransform = function (element) {
            return {
                top: parseInt(element.css('top')),
                left: parseInt(element.css('left'))
            }
        }
    }

    function getOffset(e) {
        return {
            left: e[0].offsetLeft, top: e[0].offsetTop
        }
    }
    function oadd(a, b) {
        return { left: a.left + b.left, top: a.top + b.top };
    }
    function osub(a, b) {
        return { left: a.left - b.left, top: a.top - b.top };
    }

    $.fn.quicksand = function (collection, customOptions) {
        var options = {
            duration: 1200,
            easing: 'swing',
            attribute: 'data-id', // attribute to recognize same items within source and dest
            adjustHeight: 'auto', // 'dynamic' animates height during shuffling (slow), 'auto' adjusts it before or after the animation, false leaves height constant
            useScaling: true, // disable it if you're not using scaling effect or want to improve performance
            enhancement: function (c) { }, // Visual enhacement (eg. font replacement) function for cloned elements
            selector: '> *',
            dx: 0,
            dy: 0
        };
        $.extend(options, customOptions);

        if ($.browser.msie || (typeof ($.fn.scale) == 'undefined')) {
            // Got IE and want scaling effect? Kiss my ass.
            options.useScaling = false;
        }

        var callbackFunction;
        if (typeof (arguments[1]) == 'function') {
            var callbackFunction = arguments[1];
        } else if (typeof (arguments[2] == 'function')) {
            var callbackFunction = arguments[2];
        }


        return this.each(function __quicksand(i) {
            var val;
            var animationQueue = []; // used to store all the animation params before starting the animation; solves initial animation slowdowns
            var $collection = $(collection).clone(); // destination (target) collection
            var $sourceParent = $(this); // source, the visible container of source collection
            var sourceHeight = $(this).css('height'); // used to keep height and document flow during the animation

            if (cssTrans) $sourceParent.addClass('quicksand');

            var destHeight;
            var adjustHeightOnCallback = false;

            // Replace the collection and quit if IE6
            // also if css transforms aren't supported, and this is a table.
            // and opera can fuck off.
            if (($.browser.msie && $.browser.version.substr(0, 1) < 7)
                || (!cssTransforms && $collection.filter('tr').length)
                || ($.browser.opera)) {
                $sourceParent.html('').append($collection);
                return;
            }

            // Gets called when any animation is finished
            var postCallbackPerformed = 0; // prevents the function from being called more than one time
            var postCallback = function () {
                if (!postCallbackPerformed) {
                    postCallbackPerformed = 1;

                    $sourceParent.find('> *[data-remove="true"]').remove();
                    $sourceParent.find(options.selector).stop(true, true);

                    options.enhancement($sourceParent); // Perform custom visual enhancements on a newly replaced collection
                    if (typeof callbackFunction == 'function') {
                        callbackFunction.call(this);
                    }

                    $sourceParent.data('quicksand-postCallback-timer', 0);
                    $sourceParent.data('quicksand-postCallback', null);
                }
            };

            // If last anim not finished, execute the post callback now
            var lastPostCallback = $sourceParent.data('quicksand-postCallback-timer');
            if (lastPostCallback) {
                clearTimeout(lastPostCallback);
                $sourceParent.data('quicksand-postCallback')();
            }


            // get positions of source collections
            var offsets = {}; // coordinates of every source collection item   
            $sourceParent.find(options.selector).each(function (i) {
                var e = $(this);

                if (!cssTransforms) setTransform(e, { left: 0, top: 0 });

                offsets[e.attr(options.attribute)] = oadd(getOffset(e), getTransform(e));
            });

            // save original items, and replace with destination collection
            var contentsHolder = $('<div>');
            var contents = $sourceParent.contents();
            contentsHolder.append(contents);
            $sourceParent.append($collection);

            // get destination offsets
            var dstOffsets = {};
            $collection.each(function () {
                var e = $(this);
                dstOffsets[e.attr(options.attribute)] = getOffset(e);
            });

            // now replace the collection
            $collection.remove();
            $sourceParent.append(contents);

            var $source = $(this).find(options.selector); // source collection items

            // stops previous animations on source container
            $(this).stop();
            $source.each(function (i) {
                $(this).stop(); // stop animation of collection items
            });

            var reinsert = removeToInsertLater($sourceParent[0]);

            // Now it's time to do shuffling animation
            // First of all, we need to identify same elements within source and destination collections
            var toMove = [], toRemove = [], toAdd = [];
            var lastInserted = null;
            $source.each(function (i) {
                var e = $(this);
                if (dstOffsets[e.attr(options.attribute)]) {
                    // The item is both in source and destination collections
                    // It it's under different position, let's move it
                    // keep active items prepended, so relative position isn't broken
                    if (lastInserted)
                        e.insertAfter(lastInserted);
                    else
                        e.prependTo($sourceParent);
                    lastInserted = e;
                    toMove.push(e);
                } else {
                    // The item from source collection is not present in destination collections
                    // Let's remove it, from end of collection
                    e.remove().appendTo($sourceParent);
                    toRemove.push(e);
                }
            });

            $collection.each(function (i) {
                // Grab all items from target collection not present in visible source collection
                var id = $(this).attr(options.attribute);
                var sourceElement = $source.filter('[' + options.attribute + '=' + id + ']');

                if (sourceElement.length === 0) {
                    // No such element in source collection...
                    // Let's create it
                    var d = $(this).clone();
                    d.css('opacity', 0.0);
                    d.prependTo($sourceParent);
                    toAdd.push(d);
                }
            });

            reinsert();

            // Now do the repositioning and animation
            for (i = 0; i < toMove.length; i++) {
                var e = toMove[i];
                var id = e.attr(options.attribute);
                if (!cssTransforms) setTransform(e, { left: 0, top: 0 });
                var current = getOffset(e);
                var src = offsets[id];
                var dst = dstOffsets[id];

                if (DEBUG) console.log("move", id, current.top, src.top, dst.top);
                setTransform(e, osub(src, current));
                animationQueue.push({
                    element: e, animation: osub(dst, current)
                });
                e.attr('data-remove', false);
            }

            for (i = 0; i < toRemove.length; i++) {
                var e = toRemove[i];
                var id = e.attr(options.attribute);
                if (!cssTransforms) setTransform(e, { left: 0, top: 0 });
                var current = getOffset(e);
                var src = offsets[id];

                if (DEBUG) console.log("remove", id, current.top, src.top);
                setTransform(e, osub(src, current));

                e.attr('data-remove', true);
                if (!options.useScaling) {
                    animationQueue.push({ element: e,
                        animation: { opacity: '0.0' }
                    });
                } else {
                    animationQueue.push({ element: e, animation: { opacity: '0.0',
                        scale: '0.0'
                    }
                    });
                }
            }

            for (i = 0; i < toAdd.length; i++) {
                var e = toAdd[i];
                var id = e.attr(options.attribute);
                if (!cssTransforms) setTransform(e, { left: 0, top: 0 });
                var current = getOffset(e);
                var dst = dstOffsets[id];
                var animationOptions = {
                    opacity: 1.0
                };
                if (options.useScaling) {
                    d.css(prefix + 'transform', 'scale(0.0)');
                    animationOptions.scale = 1.0;
                }

                if(DEBUG) console.log("add", id, current.top, dst.top, e);
                setTransform(e, osub(dst, current));

                animationQueue.push({
                    element: e,
                    animation: animationOptions
                });
            }

            options.enhancement($sourceParent); // Perform custom visual enhancements during the animation
            for (i = 0; i < animationQueue.length; i++) {
                transform.call(this, animationQueue[i].element, animationQueue[i].animation, options.duration, options.easing, postCallback);
            }

            $sourceParent.data('quicksand-postCallback', postCallback);
            $sourceParent.data('quicksand-postCallback-timer', setTimeout(postCallback, options.duration));
        });
    };
})(jQuery);