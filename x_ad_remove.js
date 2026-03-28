/*
 X/Twitter ad remover for Loon
 目标：过滤时间线/搜索中的推广推文、推荐关注、who to follow、promoted trend 等模块
*/

function safeParse(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function hasAdMarker(obj) {
  if (!obj) return false;
  const s = JSON.stringify(obj);
  return (
    /"promotedMetadata"/i.test(s) ||
    /"promoted_metadata"/i.test(s) ||
    /"advertiser_results"/i.test(s) ||
    /"impression_pings"/i.test(s) ||
    /promoted/i.test(s) && /tweet|trend|user|metadata|content/i.test(s)
  );
}

function isBadEntry(entry) {
  if (!entry) return false;
  const entryId = String(entry.entryId || entry.entry_id || '');
  const content = entry.content || {};
  const itemContent = content.itemContent || content.item || {};
  const displayType = String(content.entryType || content.displayType || itemContent.itemType || '');
  const s = JSON.stringify(entry);

  if (/promoted|who-to-follow|who_to_follow|connect-module|suggested-users|suggestions|related-users|topic-to-follow|promoted-trend/i.test(entryId)) return true;
  if (/WhoToFollow|TimelineTimelineModule|TimelineTimelineItem|Promoted|Trend|Suggestion/i.test(displayType) && /promoted|follow|suggest/i.test(s)) return true;
  if (/socialContext|who_to_follow|UserCell|user_results/i.test(s) && /follow|suggest|recommend/i.test(s)) return true;
  if (hasAdMarker(entry)) return true;
  return false;
}

function filterEntries(entries) {
  if (!Array.isArray(entries)) return entries;
  return entries.filter(e => !isBadEntry(e));
}

function walk(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const item = obj[i];
      if (isBadEntry(item)) {
        obj.splice(i, 1);
      } else {
        walk(item);
      }
    }
    return obj;
  }

  if (obj.entries && Array.isArray(obj.entries)) {
    obj.entries = filterEntries(obj.entries);
  }

  if (obj.instructions && Array.isArray(obj.instructions)) {
    obj.instructions.forEach(ins => {
      if (ins.entries) ins.entries = filterEntries(ins.entries);
      if (ins.entry && isBadEntry(ins.entry)) delete ins.entry;
    });
  }

  if (obj.moduleItems && Array.isArray(obj.moduleItems)) {
    obj.moduleItems = obj.moduleItems.filter(i => !isBadEntry(i));
  }

  if (obj.items && Array.isArray(obj.items)) {
    for (let i = obj.items.length - 1; i >= 0; i--) {
      if (isBadEntry(obj.items[i])) obj.items.splice(i, 1);
      else walk(obj.items[i]);
    }
  }

  if (obj.promotedMetadata) delete obj.promotedMetadata;
  if (obj.promoted_metadata) delete obj.promoted_metadata;
  if (obj.impression_pings) delete obj.impression_pings;
  if (obj.advertiser_results) delete obj.advertiser_results;

  for (const k of Object.keys(obj)) {
    walk(obj[k]);
  }
  return obj;
}

const data = safeParse($response.body);
if (!data) {
  $done({});
} else {
  const out = walk(data);
  $done({ body: JSON.stringify(out) });
}