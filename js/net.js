/* ============================================================
   GUNBALD — net.js
   Thin WebSocket client: connect, matchmake, send/recv JSON.
   Connects to the same origin that served the page, so it works
   automatically when hosted by server.js (ws / wss auto-picked).
   ============================================================ */
(function (GB) {
  'use strict';

  const Net = {
    ws: null,
    side: null,          // 'host' | 'guest'
    oppName: null,
    state: 'idle',       // idle|connecting|waiting|matched|disconnected|error
    errMsg: '',
    onMsg: null,         // game sets this: (msg) => {}
    onState: null,       // ui sets this: (state) => {}

    available() {
      // ws only works when served by server.js (not the static python preview)
      return typeof WebSocket !== 'undefined';
    },

    connect(name) {
      if (this.ws) this.close();
      this.name = (name || 'Pilot').slice(0, 16);
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = proto + '://' + location.host;
      this._set('connecting');
      try { this.ws = new WebSocket(url); }
      catch (e) { this.errMsg = 'Could not open a connection.'; this._set('error'); return; }

      this.ws.onopen = () => { this.send({ t: 'queue', name: this.name }); };
      this.ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        this._recv(m);
      };
      this.ws.onerror = () => { this.errMsg = 'Connection failed — is the online server running?'; };
      this.ws.onclose = () => {
        this.ws = null;
        if (this.state === 'connecting' || this.state === 'waiting') {
          if (!this.errMsg) this.errMsg = 'Connection closed.';
          this._set('error');
        } else if (this.state !== 'idle') {
          this._set('disconnected');
        }
      };
    },

    _recv(m) {
      if (m.t === 'waiting') { this._set('waiting'); return; }
      if (m.t === 'matched') { this.side = m.side; this.oppName = m.opp || 'Rival'; this._set('matched'); }
      if (this.onMsg) this.onMsg(m);
    },

    send(m) {
      if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(m)); } catch (e) {} }
    },

    cancel() { this.send({ t: 'cancel' }); this.close(); },

    close() {
      this.state = 'idle'; this.errMsg = '';
      if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) {} this.ws = null; }
    },

    _set(s) { this.state = s; if (this.onState) this.onState(s); },
  };

  GB.Net = Net;
})(window.GB);
