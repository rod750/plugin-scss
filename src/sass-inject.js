/* global Modernizr __moduleName */
import './modernizr';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import isEmpty from 'lodash/isEmpty';
import isString from 'lodash/isString';
import isUndefined from 'lodash/isUndefined';
import cloneDeep from 'lodash/cloneDeep';
import reqwest from 'reqwest';
import url from 'url';
import path from 'path';
import resolvePath from './resolve-path';
import escape from './escape-text';
import log from './log';


const importSass = new Promise((resolve, reject) => {
    if (Modernizr.webworkers) {
        System.import('sass.js/dist/sass', __moduleName).then(Sass => {
            System.normalize('sass.js/dist/sass.worker', __moduleName).then(worker => {
                resolve(new Sass(worker));
            });
        }).catch(err => reject(err));
    } else {
        System.import('sass.js/dist/sass.sync', __moduleName).then(Sass => {
            resolve(Sass);
        }).catch(err => reject(err));
    }
});

const sassImporter = (request, done) => {
    let resolved;
    let content;
    // Currently only supporting scss imports due to
    // https://github.com/sass/libsass/issues/1695
    resolvePath(request).then(resolvedUrl => {
            resolved = resolvedUrl;
            const partialPath = resolved.replace(/\/([^/]*)$/, '/_$1');
            return request(partialPath);
        })
        .then(resp => {
            // In Cordova Apps the response is the raw XMLHttpRequest
            content = resp.responseText ? resp.responseText : resp;
            return content;
        })
        .catch(() => reqwest(resolved))
        .then(resp => {
            content = resp.responseText ? resp.responseText : resp;
            return content;
        })
        .then(() => done({
            content,
            path: resolved,
        }))
        .catch(() => done());
};

// intercept file loading requests (@import directive) from libsass
importSass.then(sass => {
    sass.importer(sassImporter);
});

const compile = scss => {
    return new Promise((resolve, reject) => {
        importSass.then(sass => {

            if (isString(scss.content) && isEmpty(scss.content)
                || !isUndefined(scss.content.responseText)
                && isEmpty(scss.content.responseText)) {
                    return resolve('');
            }

            log('warn', scss);

            scss.content = scss.content.replace(/@import ([a-z_-]+)/g, '@import _$1');

            log('warn', scss.content);

            sass.compile(scss.content, scss.options, result => {

                if (result.status === 0) {
                    // credit : plugin-sass = screendriver + co - ty.
                    if (!isUndefined(System.sassPluginOptions)
                        && System.sassPluginOptions.autoprefixer) {
                        postcss([autoprefixer])
                            .process(result.text)
                            .then(({ css }) => {
                                resolve(escape(css));
                            });
                    } else {
                        resolve(escape(result.text));
                    }
                } else {
                    log('warn', 'Stacklite :: github:KevCJones/plugin-scss/sass-inject-build.js -> npm:sass.js', true);
                    
                    var message = result.formatted ? result.formatted : result.error;

                    log('error', message, true);

                    reject(message);
                }
            });
        });
    });
};

export default load => {
    const urlParsed = url.parse(load.address);
    const urlBaseProtocolAndHost = urlParsed.protocol + '//' + urlParsed.host;
    const urlBaseFolder = path.dirname(urlParsed.pathname) + '/';
    const urlBase = urlBaseProtocolAndHost + urlBaseFolder;
    const indentedSyntax = load.address.endsWith('.sass');

    let options = {};

    if (!isUndefined(System.sassPluginOptions)
        && !isUndefined(System.sassPluginOptions.sassOptions)) {
        options = cloneDeep(System.sassPluginOptions.sassOptions);
    }
    options.indentedSyntax = options.indentedSyntax ? options.indentedSyntax : indentedSyntax;
    options.importer = {
        urlBase,
    };

    log('info', options);

    // load initial scss file
    return reqwest(load.address)
        // In Cordova Apps the response is the raw XMLHttpRequest
        .then(resp => {
            // we want this in case there is a problem in compile
            System.meta.loadAddress = load.address;
            return {
                content: resp.responseText ? resp.responseText : resp,
                options,
            };
        })
        .then(compile);
};
