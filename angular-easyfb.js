/*global angular*/
(function (module) {

  module
  .provider('$FB', function () {

    var NO_CALLBACK = -1;

    /**
     * Specify published apis and executable callback argument index
     *
     * ref: https://developers.facebook.com/docs/reference/javascript/
     */
    var _publishedApis = {
      // core
      api: [1, 2, 3],
      ui: 1,

      // auth
      getAuthResponse: NO_CALLBACK,
      getLoginStatus: 0,
      login: 0,
      logout: 0,

      // event
      'Event.subscribe': 1,
      'Event.unsubscribe': 1,  // not quite a callback though

      // xfbml
      'XFBML.parse': 1,

      // canvas
      'Canvas.Prefetcher.addStaticResource': NO_CALLBACK,
      'Canvas.Prefetcher.setCollectionMode': NO_CALLBACK,
      'Canvas.hideFlashElement': NO_CALLBACK,
      'Canvas.scrollTo': NO_CALLBACK,
      'Canvas.setAutoGrow': NO_CALLBACK,
      'Canvas.setDoneLoading': 0,
      'Canvas.setSize': NO_CALLBACK,
      'Canvas.setUrlHandler': 0,
      'Canvas.showFlashElement': NO_CALLBACK,
      'Canvas.startTimer': NO_CALLBACK,
      'Canvas.stopTimer': 0
    };

    // Default locale
    var _locale = 'en_US';

    // Default init parameters
    var _initParams = {
      // appId      : '', // App ID from the App Dashboard
      // channelUrl : '', // Channel File for x-domain communication
      status     : true, // check the login status upon init?
      cookie     : true, // set sessions cookies to allow your server to access the session?
      xfbml      : true  // parse XFBML tags on this page?
    };
    
    /**
     * Default load SDK function
     *
     * Injectable local: 
     *   $fbAsyncInit - module's private trigger of FB.init, should always be called to complete the $FB init process
     *   $fbLocale    - configured SDK locale
     */
    var _defaultLoadSDKFunction = [
                   '$window', '$document', '$fbAsyncInit', '$fbLocale',
          function ($window,   $document,   $fbAsyncInit,   $fbLocale) {
            // Load the SDK's source Asynchronously
            (function(d){
              var js, id = 'facebook-jssdk', ref = d.getElementsByTagName('script')[0];
              if (d.getElementById(id)) {return;}
              js = d.createElement('script'); js.id = id; js.async = true;
              js.src = "//connect.facebook.net/" + $fbLocale + "/all.js";
              // js.src = "//connect.facebook.net/" + $fbLocale + "/all/debug.js";  // debug
              ref.parentNode.insertBefore(js, ref);
            }($document[0]));

            $window.fbAsyncInit = $fbAsyncInit;
          }],
        _loadSDKFunction = _defaultLoadSDKFunction;

    /**
     * Default init function
     *
     * Injectable locals: 
     *   $fbInitParams - parameters provided by $FBProvider.setInitParams() or $FB.init()
     */
    var _defaultInitFunction = [
                   '$window', '$fbInitParams', 
          function ($window,   $fbInitParams) {
            // Initialize the FB JS SDK
            $window.FB.init($fbInitParams);
          }],
        _initFunction = _defaultInitFunction;

    /**
     * Getter/setter of a config
     *
     * @param  {object} target to be configured object
     * @param  {object} config configuration(optional)
     * @return {*}             copied target if "config" is not given
     */
    function _config(target, config) {
      if (angular.isObject(config)) {
        angular.extend(target, config);
      }
      else {
        return angular.copy(target);
      }
    }

    /**
     * Context and arguments proxy function
     *
     * @param  {function} func    the function
     * @param  {object}   context the context
     * @param  {array}    args    arguments
     * @return {function}         proxied function
     */
    function _proxy(func, context, args) {
      return function () {
        return func.apply(context, args);
      };
    }

    return {
      ////////////////////////////
      // provider configuration //
      ////////////////////////////
      setInitParams: function (params) {
        _config(_initParams, params);
      },
      getInitParams: function () {
        return _config(_initParams);
      },

      setLocale: function(locale) {
        _locale = locale;
      },
      getLocale: function() {
        return _locale;
      },
      
      setLoadSDKFunction: function (func) {
        if (angular.isArray(func) || angular.isFunction(func)) {
          _loadSDKFunction = func;
        }
        else {
          throw new Error('Init function type error.');
        }
      },
      getLoadSDKFunction: function () {
        return _loadSDKFunction;
      },

      setInitFunction: function (func) {
        if (angular.isArray(func) || angular.isFunction(func)) {
          _initFunction = func;
        }
        else {
          throw new Error('Init function type error.');
        }
      },
      getInitFunction: function () {
        return _initFunction;
      },

      //////////
      // $get //
      //////////
      $get: [
               '$window', '$q', '$document', '$parse', '$rootScope', '$injector',
      function ($window,   $q,   $document,   $parse,   $rootScope,   $injector) {
        var _initReady, _$FB, _savedListeners, _paramsReady, fbAsyncInit;

        _savedListeners = {};

        _paramsReady = $q.defer();

        if (_initParams.appId || _initFunction !== _defaultInitFunction) {
          _paramsReady.resolve();
        }

        _initReady = $q.defer();
        
        /**
         * #fb-root check & create
         */
        if (!$document[0].getElementById('fb-root')) {
          $document.find('body').append('<div id="fb-root"></div>');
        }

        // Run load SDK function
        fbAsyncInit = function () {
          _paramsReady.promise.then(function() {
            // Run init function
            $injector.invoke(_initFunction, null, {'$fbInitParams': _initParams});

            _$FB.$$ready = true;
            _initReady.resolve();
          });
        };
        $injector.invoke(_loadSDKFunction, null, {
          '$fbAsyncInit': fbAsyncInit,
          '$fbLocale': _locale
        });

        _$FB = {
          $$ready: false,
          init: function (params) {
            _config(_initParams, params);
            _paramsReady.resolve();
          }
        };

        /**
         * _$FB initialization
         *
         * Publish FB APIs with auto-check ready state
         */
        angular.forEach(_publishedApis, function (cbArgIndex, apiPath) {
          var getter = $parse(apiPath),
              setter = getter.assign;
          setter(_$FB, function () {
            var apiCall = _proxy(function (args) {
              var dfd, replaceCallbackAt;

              dfd = $q.defer();

              /**
               * Add or replce original callback function with deferred resolve
               * 
               * @param  {number} index expected api callback index
               */
              replaceCallbackAt = function (index) {
                var func, newFunc;

                func = angular.isFunction(args[index]) ? args[index] : angular.noop;
                newFunc = function () {
                  var funcArgs = Array.prototype.slice.call(arguments);

                  if ($rootScope.$$phase) {
                    // already in angularjs context
                    func.apply(null, funcArgs);
                    dfd.resolve.apply(dfd, funcArgs);
                  }
                  else {
                    // not in angularjs context
                    $rootScope.$apply(function () {
                      func.apply(null, funcArgs);
                      dfd.resolve.apply(dfd, funcArgs);
                    });
                  }
                };

                while (args.length <= index) {
                  args.push(null);
                }

                /**
                 * `FB.Event.unsubscribe` requires the original listener function.
                 * Save the mapping of original->wrapped on `FB.Event.subscribe` for unsubscribing.
                 */
                var eventName;
                if (apiPath === 'Event.subscribe') {
                  eventName = args[0];
                  if (angular.isUndefined(_savedListeners[eventName])) {
                    _savedListeners[eventName] = [];
                  }
                  _savedListeners[eventName].push({
                    original: func,
                    wrapped: newFunc
                  });
                }
                else if (apiPath === 'Event.unsubscribe') {
                  eventName = args[0];
                  if (angular.isArray(_savedListeners[eventName])) {
                    var i, subscribed, l = _savedListeners[eventName].length;
                    for (i = 0; i < l; i++) {
                      subscribed = _savedListeners[eventName][i];
                      if (subscribed.original === func) {
                        newFunc = subscribed.wrapped;
                        _savedListeners[eventName].splice(i, 1);
                        break;
                      }
                    }
                  }
                }

                // Replace the original one (or null) with newFunc
                args[index] = newFunc;
              };

              if (cbArgIndex !== NO_CALLBACK) {
                if (angular.isNumber(cbArgIndex)) {
                  /**
                   * Constant callback argument index
                   */
                  replaceCallbackAt(cbArgIndex);
                }
                else if (angular.isArray(cbArgIndex)) {
                  /**
                   * Multiple possible callback argument index
                   */
                  var i, c;
                  for (i = 0; i < cbArgIndex.length; i++) {
                    c = cbArgIndex[i];

                    if (args.length == c ||
                        args.length == (c + 1) && angular.isFunction(args[c])) {

                      replaceCallbackAt(c);

                      break;
                    }
                  }
                }
              }

              /**
               * Apply back to original FB SDK
               */
              var origFBFunc = getter($window.FB);
              if (!origFBFunc) {
                throw new Error("Facebook API `FB." + apiPath + "` doesn't exist.");
              }
              origFBFunc.apply($window.FB, args);

              return dfd.promise;
            }, null, [Array.prototype.slice.call(arguments)]);

            /**
             * Wrap the api function with our ready promise
             *
             * The only exception is `getAuthResponse`, which doesn't rely on a callback function to get the response
             */
            if (apiPath === 'getAuthResponse') {
              if (angular.isUndefined($window.FB)) {
                throw new Error('`FB` is not ready.');
              }
              return $window.FB.getAuthResponse();
            }
            else if (cbArgIndex === NO_CALLBACK) {
              // Do not return promise for no-callback apis
              _initReady.promise.then(apiCall); 
            }
            else {
              return _initReady.promise.then(apiCall);
            }
          });
        });

        return _$FB;
      }]
    };
  })

  /**
   * @ngdoc directive
   * @name ng.directive:ezfbXfbml
   * @restrict EAC
   *
   * @description
   * Parse XFBML inside the directive
   *
   * @param {boolean} ezfb-xfbml Reload trigger for inside XFBML,
   *                             should keep only XFBML content inside the directive.
   * @param {expr}    onrender   Evaluated every time content xfbml gets rendered.
   */
  .directive('ezfbXfbml', [
           '$FB', '$parse', '$compile', '$timeout',
  function ($FB,   $parse,   $compile,   $timeout) {
    return {
      restrict: 'EAC',
      controller: function () {
        // do nothing
      },
      compile: function (tElm, tAttrs) {
        var _savedHtml = tElm.html();

        return function postLink(scope, iElm, iAttrs) {
          var _rendering = true,
              onrenderExp = iAttrs.onrender,
              onrenderHandler = function () {
                if (_rendering) {
                  if (onrenderExp) {
                    scope.$eval(onrenderExp);
                  }
                  
                  _rendering = false;
                }
              };

          $FB.XFBML.parse(iElm[0], onrenderHandler);

          /**
           * The trigger
           */
          var setter = $parse(iAttrs.ezfbXfbml).assign;
          scope.$watch(iAttrs.ezfbXfbml, function (val) {
            if (val) {
              _rendering = true;
              iElm.html(_savedHtml);

              $compile(iElm.contents())(scope);
              $timeout(function () {
                $FB.XFBML.parse(iElm[0], onrenderHandler);
              });

              // Reset the trigger if it's settable
              (setter || angular.noop)(scope, false);
            }
          }, true);

        };
      }
    };
  }]);


  // ref: https://developers.facebook.com/docs/plugins
  var _socialPluginDirectiveConfig = {
    'fbLike': [
      'action', 'colorscheme', 'href', 'kidDirectedSite',
      'layout', 'ref', 'share', 'showFaces', 'width'
    ],
    'fbShareButton': [
      'href', 'layout', 'width'
    ],
    'fbSend': [
      'colorscheme', 'href', 'kidDirectedSite', 'ref'
    ],
    'fbPost': [
      'href', 'width'
    ],
    'fbFollow': [
      'colorscheme', 'href', 'kidDirectedSite', 'layout',
      'showFaces', 'width'
    ],
    'fbComments': [
      'colorscheme', 'href', 'mobile', 'numPosts',
      'orderBy', 'width'
    ],
    'fbActivity': [
      'action', 'appId', 'colorscheme', 'filter', 'header',
      'height', 'linktarget', 'maxAge', 'recommendations',
      'ref', 'site', 'width'
    ],
    'fbRecommendations': [
      'action', 'appId', 'colorscheme', 'header', 'height',
      'linktarget', 'maxAge', 'ref', 'site', 'width'
    ],
    'fbRecommendationsBar': [
      'action', 'href', 'maxAge', 'numRecommendations',
      'readTime', 'ref', 'side', 'site', 'trigger'
    ],
    'fbLikeBox': [
      'colorscheme', 'forceWall', 'header', 'height',
      'href', 'showBorder', 'showFaces', 'stream', 'width'
    ],
    'fbFacepile': [
      'action', 'appId', 'colorscheme', 'href', 'maxRows',
      'size', 'width'
    ]
  };

  angular.forEach(_socialPluginDirectiveConfig, creatSocialPluginDirective);

  function creatSocialPluginDirective(availableAttrs, dirName) {
    var CLASS_WRAP_SPAN = 'ezfb-social-plugin-wrap',
        STYLE_WRAP_SPAN = 'display: inline-block; width: 0; height: 0; overflow: hidden;';
    
    /**
     * Wrap-related functions
     */
    var _wrap = function ($elm) {
          var tmpl = '<span class="'+CLASS_WRAP_SPAN+'" style="'+STYLE_WRAP_SPAN+'">';
          return $elm.wrap(tmpl).parent();
        },
        _isWrapped = function ($elm) {
          return $elm.parent().hasClass(CLASS_WRAP_SPAN);
        },
        _unwrap = function ($elm) {
          var $parent = $elm.parent();
          $parent.after($elm).remove();
          return $elm;
        };
    
    module.directive(dirName, [
             '$FB',
    function ($FB) {
      return {
        restrict: 'EC',
        require: '?^ezfbXfbml',
        link: function postLink(scope, iElm, iAttrs, xfbmlCtrl) {
          /**
           * For backward compatibility, skip self rendering if contained by easyfb-xfbml directive
           */
          if (xfbmlCtrl) {
            return;
          }

          var rendering = false,
              renderId = 0;

          scope.$watch(function () {
            var watchList = [];
            angular.forEach(availableAttrs, function (attrName) {
              watchList.push(iAttrs[attrName]);
            });
            return watchList;
          }, function (v) {
            renderId++;
            if (!rendering) {
              rendering = true;

              // Wrap the social plugin code for FB.XFBML.parse
              $FB.XFBML.parse(_wrap(iElm)[0], genOnRenderHandler(renderId));
            }
            else {
              // Already rendering, do not wrap
              $FB.XFBML.parse(iElm.parent()[0], genOnRenderHandler(renderId));
            }
          }, true);

          // Unwrap on $destroy
          iElm.bind('$destroy', function () {
            if (_isWrapped(iElm)) {
              _unwrap(iElm);
            }
          });

          function genOnRenderHandler(id) {
            return function () {
              var onrenderExp;

              if (rendering && id === renderId) {
                onrenderExp = iAttrs.onrender;
                if (onrenderExp) {
                  scope.$eval(onrenderExp);
                }

                rendering = false;
                _unwrap(iElm);
              }
            };
          }
        }
      };
    }]);
  }

})(angular.module('ezfb', []));
