var md = require('marked'),
    InlineLexer = md.InlineLexer,
    Parser = md.Parser;
    Renderer = md.Renderer;

Parser.prototype.parse = function(src) {
  this.inline = new InlineLexer(src.links, this.options, this.renderer);
  this.tokens = src.reverse();

  var out = {
    elem: 'markdown',
    content: []
  };
  while (this.next()) {
    out.content.push(this.tok());
  }

  return out;
};

Parser.prototype.tok = function() {
  switch (this.token.type) {
    case 'space': {
      return '';
    }
    case 'hr': {
      return this.renderer.hr();
    }
    case 'heading': {
      return this.renderer.heading(
        this.inline.output(this.token.text),
        this.token.depth,
        this.token.text);
    }
    case 'code': {
      return this.renderer.code(this.token.text,
        this.token.lang,
        this.token.escaped);
    }
    case 'table': {
      var header = []
        , body = []
        , i
        , row
        , cell
        , flags
        , j;

      // header
      cell = [];
      for (i = 0; i < this.token.header.length; i++) {
        flags = { header: true, align: this.token.align[i] };
        cell.push(this.renderer.tablecell(
          this.inline.output(this.token.header[i]),
          { header: true, align: this.token.align[i] }
        ));
      }
      header.push(this.renderer.tablerow(cell));

      for (i = 0; i < this.token.cells.length; i++) {
        row = this.token.cells[i];

        cell = [];
        for (j = 0; j < row.length; j++) {
          cell.push(this.renderer.tablecell(
            this.inline.output(row[j]),
            { header: false, align: this.token.align[j] }
          ));
        }

        body.push(this.renderer.tablerow(cell));
      }
      return this.renderer.table(header, body);
    }
    case 'blockquote_start': {
      var body = [];

      while (this.next().type !== 'blockquote_end') {
        body.push(this.tok());
      }

      return this.renderer.blockquote(body);
    }
    case 'list_start': {
      var body = []
        , ordered = this.token.ordered;

      while (this.next().type !== 'list_end') {
        body.push(this.tok());
      }

      return this.renderer.list(body, ordered);
    }
    case 'list_item_start': {
      var body = [];

      while (this.next().type !== 'list_item_end') {
        body.push(this.token.type === 'text'
          ? this.parseText()
          : this.tok());
      }

      return this.renderer.listitem(body);
    }
    case 'loose_item_start': {
      var body = [];

      while (this.next().type !== 'list_item_end') {
        body.push(this.tok());
      }

      return this.renderer.listitem(body);
    }
    case 'html': {
      var html = !this.token.pre && !this.options.pedantic
        ? this.inline.output(this.token.text)
        : this.token.text;
      return this.renderer.html(html);
    }
    case 'paragraph': {
      return this.renderer.paragraph(this.inline.output(this.token.text));
    }
    case 'text': {
      return this.renderer.paragraph(this.parseText());
    }
  }
};

InlineLexer.prototype.output = function(src) {
  var out = []
    , link
    , text
    , href
    , cap;

  while (src) {
    // escape
    if (cap = this.rules.escape.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, cap[1]);
      continue;
    }

    // autolink
    if (cap = this.rules.autolink.exec(src)) {
      src = src.substring(cap[0].length);
      if (cap[2] === '@') {
        text = cap[1].charAt(6) === ':'
          ? this.mangle(cap[1].substring(7))
          : this.mangle(cap[1]);
        href = this.mangle('mailto:') + text;
      } else {
        text = cap[1];
        href = text;
      }
      out = this.concat(out, this.renderer.link(href, null, text));
      continue;
    }

    // url (gfm)
    if (cap = this.rules.url.exec(src)) {
      src = src.substring(cap[0].length);
      text = cap[1];
      href = text;
      out = this.concat(out, this.renderer.link(href, null, text));
      continue;
    }

    // tag
    if (cap = this.rules.tag.exec(src)) {
      src = src.substring(cap[0].length);
      out = cap[0];
      continue;
    }

    // link
    if (cap = this.rules.link.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.outputLink(cap, {
          href: cap[2],
          title: cap[3]
        })
      );
      continue;
    }

    // reflink, nolink
    if ((cap = this.rules.reflink.exec(src))
        || (cap = this.rules.nolink.exec(src))) {
      src = src.substring(cap[0].length);
      link = (cap[2] || cap[1]).replace(/\s+/g, ' ');
      link = this.links[link.toLowerCase()];
      if (!link || !link.href) {
        out = this.concat(out, cap[0].charAt(0));
        src = cap[0].substring(1) + src;
        continue;
      }
      out = this.concat(out, this.outputLink(cap, link));
      continue;
    }

    // strong
    if (cap = this.rules.strong.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.renderer.strong(this.output(cap[2] || cap[1])));
      continue;
    }

    // em
    if (cap = this.rules.em.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.renderer.em(this.output(cap[2] || cap[1])));
      continue;
    }

    // code
    if (cap = this.rules.code.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.renderer.codespan(cap[2]));
      continue;
    }

    // br
    if (cap = this.rules.br.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.renderer.br());
      continue;
    }

    // del (gfm)
    if (cap = this.rules.del.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.renderer.del(this.output(cap[1])));
      continue;
    }

    // text
    if (cap = this.rules.text.exec(src)) {
      src = src.substring(cap[0].length);
      out = this.concat(out, this.smartypants(cap[0]));
      continue;
    }

    if (src) {
      throw new
        Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
  }

  return out;
};

InlineLexer.prototype.concat = function(out, data) {
  out.push(data);
  return out;
};

Renderer.prototype.code = function(code, lang, escaped) {

  return {
    elem: 'code',
    opts: {
      lang: lang,
      escaped: escaped
    },
    content: [
      code
    ]
  }

  // if (this.options.highlight) {
  //   var out = this.options.highlight(code, lang);
  //   if (out != null && out !== code) {
  //     escaped = true;
  //     code = out;
  //   }
  // }

  // if (!lang) {
  //   return '<pre><code>'
  //     + (escaped ? code : escape(code, true))
  //     + '\n</code></pre>';
  // }

  // return '<pre><code class="'
  //   + this.options.langPrefix
  //   + escape(lang, true)
  //   + '">'
  //   + (escaped ? code : escape(code, true))
  //   + '\n</code></pre>\n';
};

Renderer.prototype.blockquote = function(quote) {
  return {
    elem: 'blockquote',
    content: [
      quote
    ]
  }
  // return '<blockquote>\n' + quote + '</blockquote>\n';
};

Renderer.prototype.html = function(html) {
  return {
    elem: 'html',
    content: [
      html
    ]
  }
};

Renderer.prototype.heading = function(text, level, raw) {

  return {
    elem: 'heading',
    opts: {
      level: level,
      raw: raw
    },
    content: [
      text
    ]
  }

  // return '<h'
  //   + level
  //   + ' id="'
  //   + this.options.headerPrefix
  //   + raw.toLowerCase().replace(/[^\w]+/g, '-')
  //   + '">'
  //   + text
  //   + '</h'
  //   + level
  //   + '>\n';
};

Renderer.prototype.hr = function() {

  return {
    elem: 'hr'
  }
};

Renderer.prototype.list = function(body, ordered) {

  return {
    elem: 'list',
    opts: {
      ordered: ordered
    },
    content: body
  }
};

Renderer.prototype.listitem = function(text) {

  return {
    elem: 'listitem',
    content: text
  }
};

Renderer.prototype.paragraph = function(text) {

  return {
    elem: 'paragraph',
    content: [
      text
    ]
  }
};

Renderer.prototype.table = function(header, body) {

  return {
    elem: 'table',
    opts: {
      header: header
    },
    content: [
      body
    ]
  }

  // return '<table>\n'
  //   + '<thead>\n'
  //   + header
  //   + '</thead>\n'
  //   + '<tbody>\n'
  //   + body
  //   + '</tbody>\n'
  //   + '</table>\n';
};

Renderer.prototype.tablerow = function(content) {

  return {
    elem: 'tablerow',
    content: [
      content
    ]
  }
};

Renderer.prototype.tablecell = function(content, flags) {

  return {
    elem: 'tablecell',
    opts: {
      flags: flags
    },
    content: [
      content
    ]
  }
};

// span level renderer
Renderer.prototype.strong = function(text) {

  return {
    elem: 'strong',
    content: [
      text
    ]
  }
};

Renderer.prototype.em = function(text) {

  return {
    elem: 'em',
    content: [
      text
    ]
  }
};

Renderer.prototype.codespan = function(text) {

  return {
    elem: 'codespan',
    content: [
      text
    ]
  }
};

Renderer.prototype.br = function() {

  return {
    elem: 'br'
  }
};

Renderer.prototype.del = function(text) {

  return {
    elem: 'del',
    content: [
      text
    ]
  }
};

Renderer.prototype.link = function(href, title, text) {

  return {
    elem: 'link',
    opts: {
      title: title,
      href: href
    },
    content: [
      text
    ]
  }
};

Renderer.prototype.image = function(href, title, text) {

  return {
    elem: 'image',
    opts: {
      title: title,
      href: href
    },
    content: [
      text
    ]
  }
};

module.exports = md;