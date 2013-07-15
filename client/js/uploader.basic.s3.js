/**
 * This defines FineUploaderBasic mode w/ support for uploading to S3, which provides all the basic
 * functionality of Fine Uploader Basic as well as code to handle uploads directly to S3.
 * Some inherited options and API methods have a special meaning in the context of the S3 uploader.
 */
qq.FineUploaderBasicS3 = function(o) {
    var options = {
        s3: {
            // required
            accessKey: null,
            acl: 'private',
            // required
            getSignatureEndpoint: null,
            // 'uuid', 'filename', or a function, which may be promissory
            keyname: 'uuid'
        }
    };

    // Replace any default options with user defined ones
    qq.extend(options, o, true);

    // These are additional options that must be passed to the upload handler
    this._s3BasicOptions = {
        s3: options.s3
    };

    // Call base module
    qq.FineUploaderBasic.call(this, options);

    this._keyNames = [];
};

// Inherit basic public & private API methods.
qq.extend(qq.FineUploaderBasicS3.prototype, qq.basePublicApi);
qq.extend(qq.FineUploaderBasicS3.prototype, qq.basePrivateApi);

// Define public & private API methods for this module.
qq.extend(qq.FineUploaderBasicS3.prototype, {
    /**
     * @param id File ID
     * @returns {*} Key name associated w/ the file, if one exists
     */
    getKey: function(id) {
        return this._keyNames[id];
    },

    /**
     * Override the parent's reset function to cleanup various S3-related items.
     */
    reset: function() {
        qq.FineUploaderBasic.prototype.reset.call(this);

        this._keyNames = [];
    },

    /**
     * Ensures the parent's upload handler creator passes the S3-specific options the handler as well as information
     * required to instantiate the specific handler based on the current browser's capabilities.
     *
     * @returns {qq.UploadHandler}
     * @private
     */
    _createUploadHandler: function() {
        var additionalOptions = qq.extend({}, this._s3BasicOptions);
        additionalOptions.s3.onGetKeyName = qq.bind(this._determineKeyName, this);

        return qq.FineUploaderBasic.prototype._createUploadHandler.call(this, additionalOptions, "S3");
    },

    /**
     * Determine the file's key name and passes it to the caller via a promissory callback.  This also may
     * delegate to an integrator-defined function that determines the file's key name on demand,
     * which also may be promissory.
     *
     * @param id ID of the file
     * @param filename Name of the file
     * @returns {qq.Promise} A promise that will be fulfilled when the key name has been determined (and will be passed to the caller via the success callback).
     * @private
     */
    _determineKeyName: function(id, filename) {
        var self = this,
            promise = new qq.Promise(),
            keynameLogic = this._s3BasicOptions.s3.keyname,
            extension = qq.getExtension(filename),
            onGetKeynameFailure = promise.failure,
            onGetKeynameSuccess = function(keyname) {
                var keynameToUse = keyname || filename;

                if (keyname && extension !== undefined) {
                    self._keyNames[id] = keynameToUse + "." + extension;
                }
                else {
                    self._keyNames[id] = keynameToUse;
                }

                promise.success(self._keyNames[id]);
            };

        switch(keynameLogic) {
            case 'uuid':
                onGetKeynameSuccess(this.getUuid(id));
                break;
            case 'filename':
                onGetKeynameSuccess();
                break;
            default:
                if (qq.isFunction(keynameLogic)) {
                    this._handleKeynameFunction(keynameLogic, id, onGetKeynameSuccess, onGetKeynameFailure);
                }
                else {
                    this.log(keynameLogic + " is not a valid value for the s3.keyname option!", "error");
                    onGetKeynameFailure();
                }
        }

        return promise;
    },

    /**
     * Called by the internal onUpload handler if the integrator has supplied a function to determine
     * the file's key name.  The integrator's function may be promissory.  We also need to fulfill
     * the promise contract associated with the caller as well.
     *
     * @param keynameFunc Integrator-supplied function that must be executed to determine the key name.  May be promissory.
     * @param id ID of the associated file
     * @param successCallback Invoke this if key name retrieval is successful, passing in the key name.
     * @param failureCallback Invoke this if key name retrieval was unsuccessful.
     * @private
     */
    _handleKeynameFunction: function(keynameFunc, id, successCallback, failureCallback) {
        var onSuccess = function(keyname) {
                successCallback(keyname);
            },
            onFailure = function() {
                this.log('Failed to retrieve key name for ' + id, "error");
                failureCallback();
            },
            keyname = keynameFunc(id);


        if (qq.isPromise(keyname)) {
            keynameFunc(id).then(onSuccess, onFailure);
        }
        else if (keyname == null) {
            onFailure();
        }
        else {
            onSuccess(keyname)
        }
    }
});
