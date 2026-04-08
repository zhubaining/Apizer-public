#!/usr/bin/env node

/**
 * connector id: wechat-web-message-manage
 *
 * 作用:
 * - 管理 Web 微信当前登录会话
 * - 支持 contacts / sync / send 三个动作
 *
 * 主接口:
 * - GET /cgi-bin/mmwebwx-bin/webwxgetcontact
 * - GET /cgi-bin/mmwebwx-bin/synccheck
 * - POST /cgi-bin/mmwebwx-bin/webwxsync
 * - POST /cgi-bin/mmwebwx-bin/webwxsendmsg
 *
 * 所需 credentials 字段:
 * - auth.cookie_header
 * - runtime.host
 * - runtime.push_host
 * - runtime.uin
 * - runtime.sid
 * - runtime.skey
 * - runtime.pass_ticket
 * - runtime.from_user_name
 * - runtime.default_to_user_name
 * - runtime.sync_key
 * - runtime.sync_check_key
 * - runtime.referer
 * - runtime.user_agent
 *
 * 输入参数:
 * - argv[2]: action，支持 contacts/sync/send
 * - send: argv[3] 为 content，argv[4] 可选 to_user_name
 *
 * 成功判定:
 * - contacts: HTTP 200 且 MemberList 存在
 * - sync: synccheck retcode === 0；若有增量则 webwxsync Ret === 0
 * - send: HTTP 200 且 BaseResponse.Ret === 0
 *
 * 注意:
 * - send 会产生真实线上副作用
 * - sync 成功后会自动把最新 sync_key 写回 credentials.json
 */

const {
  buildWechatSyncCheckKey,
  loadConnectorCredentials,
  randomDeviceId,
  randomMessageId,
  request,
  requireArg,
  writeCredentialsFile,
} = require("./_shared");

function baseHeaders(connector) {
  return {
    accept: "application/json, text/plain, */*",
    cookie: connector.auth.cookie_header,
    referer: connector.runtime.referer,
    "user-agent": connector.runtime.user_agent,
  };
}

async function getContacts(connector) {
  const url = `https://${connector.runtime.host}/cgi-bin/mmwebwx-bin/webwxgetcontact?pass_ticket=${encodeURIComponent(connector.runtime.pass_ticket)}&r=${Date.now()}&seq=0&skey=${encodeURIComponent(connector.runtime.skey)}`;
  const response = await request(url, { headers: baseHeaders(connector) });
  if (!response.ok || !Array.isArray(response.json?.MemberList)) {
    throw new Error(`Web WeChat contacts failed: HTTP ${response.status}\n${response.text}`);
  }
  return {
    member_count: response.json.MemberCount,
    items: response.json.MemberList.map((item) => ({
      user_name: item.UserName,
      nick_name: item.NickName,
      remark_name: item.RemarkName,
      verify_flag: item.VerifyFlag,
    })),
  };
}

function parseSyncCheck(text) {
  const match = text.match(/retcode:"(\d+)",selector:"(\d+)"/);
  if (!match) {
    throw new Error(`Unexpected synccheck response: ${text}`);
  }
  return { retcode: match[1], selector: match[2] };
}

async function syncMessages(all, connector) {
  const deviceId = randomDeviceId();
  const syncCheckKey = connector.runtime.sync_check_key || buildWechatSyncCheckKey(connector.runtime.sync_key);
  const pollTs = Date.now();
  const syncCheckUrl = `https://${connector.runtime.push_host}/cgi-bin/mmwebwx-bin/synccheck?r=${pollTs}&skey=${encodeURIComponent(connector.runtime.skey)}&sid=${encodeURIComponent(connector.runtime.sid)}&uin=${encodeURIComponent(connector.runtime.uin)}&deviceid=${deviceId}&synckey=${encodeURIComponent(syncCheckKey)}&_=${pollTs}`;
  const syncCheckResponse = await request(syncCheckUrl, { headers: baseHeaders(connector) });
  if (!syncCheckResponse.ok) {
    throw new Error(`Web WeChat synccheck failed: HTTP ${syncCheckResponse.status}\n${syncCheckResponse.text}`);
  }
  const syncCheck = parseSyncCheck(syncCheckResponse.text);
  if (syncCheck.retcode !== "0") {
    throw new Error(`Web WeChat synccheck returned retcode=${syncCheck.retcode}`);
  }
  if (syncCheck.selector === "0") {
    return { retcode: syncCheck.retcode, selector: syncCheck.selector, add_msg_count: 0, items: [] };
  }

  const syncUrl = `https://${connector.runtime.host}/cgi-bin/mmwebwx-bin/webwxsync?sid=${encodeURIComponent(connector.runtime.sid)}&skey=${encodeURIComponent(connector.runtime.skey)}&pass_ticket=${encodeURIComponent(connector.runtime.pass_ticket)}`;
  const syncBody = {
    BaseRequest: {
      Uin: connector.runtime.uin,
      Sid: connector.runtime.sid,
      Skey: connector.runtime.skey,
      DeviceID: deviceId,
    },
    SyncKey: connector.runtime.sync_key,
    rr: -Date.now(),
  };
  const syncResponse = await request(syncUrl, {
    method: "POST",
    headers: {
      ...baseHeaders(connector),
      "content-type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(syncBody),
  });
  if (!syncResponse.ok || syncResponse.json?.BaseResponse?.Ret !== 0) {
    throw new Error(`Web WeChat sync failed: HTTP ${syncResponse.status}\n${syncResponse.text}`);
  }

  const nextSyncKey = syncResponse.json.SyncKey;
  all.connectors["wechat-web-message-manage"].runtime.sync_key = nextSyncKey;
  all.connectors["wechat-web-message-manage"].runtime.sync_check_key = buildWechatSyncCheckKey(nextSyncKey);
  writeCredentialsFile(all);

  return {
    retcode: syncCheck.retcode,
    selector: syncCheck.selector,
    add_msg_count: syncResponse.json.AddMsgCount,
    items: (syncResponse.json.AddMsgList || []).map((item) => ({
      msg_id: item.MsgId,
      from_user_name: item.FromUserName,
      to_user_name: item.ToUserName,
      content: item.Content,
    })),
    next_sync_key: nextSyncKey,
  };
}

async function sendMessage(connector, content, toUserName) {
  const deviceId = randomDeviceId();
  const msgId = randomMessageId();
  const url = `https://${connector.runtime.host}/cgi-bin/mmwebwx-bin/webwxsendmsg?pass_ticket=${encodeURIComponent(connector.runtime.pass_ticket)}`;
  const body = {
    BaseRequest: {
      Uin: connector.runtime.uin,
      Sid: connector.runtime.sid,
      Skey: connector.runtime.skey,
      DeviceID: deviceId,
    },
    Msg: {
      Type: 1,
      Content: content,
      FromUserName: connector.runtime.from_user_name,
      ToUserName: toUserName || connector.runtime.default_to_user_name,
      LocalID: msgId,
      ClientMsgId: msgId,
    },
    Scene: 0,
  };
  const response = await request(url, {
    method: "POST",
    headers: {
      ...baseHeaders(connector),
      "content-type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || response.json?.BaseResponse?.Ret !== 0) {
    throw new Error(`Web WeChat send failed: HTTP ${response.status}\n${response.text}`);
  }
  return {
    success: true,
    msg_id: response.json.MsgID,
    local_id: response.json.LocalID,
  };
}

async function main() {
  const { all, connector } = loadConnectorCredentials("wechat-web-message-manage");
  const action = requireArg(process.argv[2], "action");

  let result;
  if (action === "contacts") {
    result = await getContacts(connector);
  } else if (action === "sync") {
    result = await syncMessages(all, connector);
  } else if (action === "send") {
    result = await sendMessage(connector, requireArg(process.argv[3], "content"), process.argv[4]);
  } else {
    throw new Error("Unsupported action. Use one of: contacts, sync, send");
  }

  console.log(JSON.stringify({ action, result }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
