class NError extends Error {

  constructor(level, message, context) {
    super(message);
    this.level = level;
    if (context) {
      this.context = context;
    }
  }

  static log(message, context) {
    return new NError(this.LOG, message, context);
  }

  static normal(message, context) {
    return new NError(this.NORMAL, message, context);
  }

  static critical(message, context) {
    return new NError(this.CRITICAL, message, context);
  }
}

NError.LOG = 0;
NError.NORMAL = 1;
NError.CRITICAL = 2;

module.exports = NError;
