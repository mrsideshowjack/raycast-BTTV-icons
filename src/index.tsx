import {
  ActionPanel,
  CopyToClipboardAction,
  OpenInBrowserAction,
  List,
  showToast,
  ToastStyle,
  allLocalStorageItems,
  setLocalStorageItem,
  clearLocalStorage,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import fetch, { AbortError } from "node-fetch";

export default function Command() {
  const { state, search } = useSearch();

  return (
    <List isLoading={state.isLoading} onSearchTextChange={search} searchBarPlaceholder="Search by name..." throttle>
      <List.Section title="Results" subtitle={state.results.length + ""}>
        {state.results.map((emote) => (
          <EmoteListItem key={emote.id} emote={emote} />
        ))}
      </List.Section>
      <List.Section title="Recent Emotes">
        {state.recentItems.map((emote) => (
          <EmoteListItem key={emote.id} emote={emote} />
        ))}
      </List.Section>
    </List>
  );
}

function EmoteListItem({ emote }: { emote: Emote }) {
  return (
    <List.Item
      title={emote.code}
      subtitle={emote.imageType}
      accessoryTitle={emote.user}
      icon={emote.imageUrl1x}
      actions={
        <ActionPanel>
          <CopyToClipboardAction
            title="Copy as markdown image"
            content={getMd(emote.code, emote.imageUrl3x)}
            onCopy={() => handleCopy(emote)}
          />
          <CopyToClipboardAction title="Copy image url" content={emote.imageUrl3x} onCopy={() => handleCopy(emote)} />
          <CopyToClipboardAction title="Copy code" content={emote.code} onCopy={() => handleCopy(emote)} />
          <OpenInBrowserAction title="Open emote in browser" url={"https://betterttv.com/emotes/" + emote.id} />
          <ActionPanel.Item title="Clear Recent Items" onAction={() => clearRecentItems()} />
        </ActionPanel>
      }
    />
  );
}

function useSearch() {
  const [state, setState] = useState<SearchState>({ results: [], isLoading: true, recentItems: [] });
  const cancelRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecentItems();
    search("");
    return () => {
      cancelRef.current?.abort();
    };
  }, []);

  async function setRecentItems() {    
    try {
      setState((oldState) => ({
        ...oldState,
        isLoading: true,
      }));
      const localStorageItems = await allLocalStorageItems();
      const recentItems =
        Object.entries(localStorageItems).length !== 0 ? Array.from(JSON.parse(localStorageItems.recentItems)) : [];

      setState((oldState) => ({
        ...oldState,
        recentItems: recentItems,
        isLoading: false,
      }));
    } catch (error) {
      if (error instanceof AbortError) {
        return;
      }
      console.error("recent items error", error);
      showToast(ToastStyle.Failure, "Could not get recent items", String(error));
    }
  }

  async function search(searchText: string) {
    cancelRef.current?.abort();
    cancelRef.current = new AbortController();
    try {
      setState((oldState) => ({
        ...oldState,
        isLoading: true,
      }));
      const results = await performSearch(searchText, cancelRef.current.signal);
      setState((oldState) => ({
        ...oldState,
        results: results,
        isLoading: false,
      }));
    } catch (error) {
      if (error instanceof AbortError) {
        return;
      }
      console.error("search error", error);
      showToast(ToastStyle.Failure, "Could not perform search", String(error));
    }
  }

  return {
    state: state,
    search: search,
  };
}

async function performSearch(searchText: string, signal: AbortSignal): Promise<Emote[]> {
  if (searchText.length <= 3) return [];

  const response = await fetch(
    `https://api.betterttv.net/3/emotes/shared/search?query=${searchText}&offset=0&limit=50`,
    {
      method: "get",
      signal: signal,
    }
  );

  if (!response.ok) {
    return Promise.reject(response.statusText);
  }

  type Json = Record<string, unknown>;

  const json = (await response.json()) as Json;

  return Promise.all(
    json.map(async (jsonResult) => {
      const result = jsonResult as Json;

      return {
        id: result.id as string,
        code: result.code as string,
        imageType: result.imageType as string,
        user: result.user.name as string,
        imageUrl1x: (await getImgUrl(jsonResult.id, 1)) as string,
        imageUrl2x: (await getImgUrl(jsonResult.id, 2)) as string,
        imageUrl3x: (await getImgUrl(jsonResult.id, 3)) as string,
      };
    })
  );
}

interface SearchState {
  results: Emote[];
  isLoading: boolean;
}

interface Emote {
  id: string;
  code: string;
  imageType: string;
  imageUrl1x: string;
  imageUrl2x: string;
  imageUrl3x: string;
  user: string;
}

async function getImgUrl(id: string, size = 3) {
  return `https://cdn.betterttv.net/emote/${id}/${size}x`;
}

function getMd(code: string, imageUrl: string) {
  return `![${code}](${imageUrl})`;
}

async function handleCopy(emote: object) {
  const localStorageItems = await allLocalStorageItems();
  const recentItems =
    Object.entries(localStorageItems).length !== 0 ? Array.from(JSON.parse(localStorageItems.recentItems)) : [];
  recentItems.push(emote);
  // TODO reload state
  return await setLocalStorageItem("recentItems", JSON.stringify(recentItems));
   
}

async function clearRecentItems() {
  await clearLocalStorage();
  showToast(ToastStyle.Success, "Clearing recent items");
}