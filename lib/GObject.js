class GObject {

  constructor(object) {
    this.object = object;
  }

  getID() {
    return this.object.id;
  }

  getType() {
    return this.object.type;
  }

  getData() {
    return this.object.data;
  }

  getRaw() {
    return this.object;
  }
}
