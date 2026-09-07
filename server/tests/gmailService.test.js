import { describe, test, expect, vi } from "vitest";
import {
  buildQuery,
  sendMessage,
  setStarred,
  setReadState
} from "../gmailService.js";


describe("buildQuery()", () => {

  test("builds unread inbox query", () => {
    const query = buildQuery({
      folder: "inbox",
      days: 10,
      unread_only: true
    });

    expect(query).toBe("in:inbox newer_than:10d is:unread");
  });

  test("builds sent folder query", () => {
    const query = buildQuery({
      folder: "sent"
    });

    expect(query).toBe("in:sent");
  });

  test("builds starred email query with sender", () => {
    const query = buildQuery({
      folder: "starred",
      sender: "test@gmail.com"
    });

    expect(query).toBe("is:starred from:test@gmail.com");
  });

});


describe("Gmail operations", () => {

  test("sendMessage sends email through Gmail API", async () => {

    const gmail = {
      users: {
        messages: {
          send: vi.fn().mockResolvedValue({
            data: { id: "test-message-123" }
          })
        }
      }
    };

    const result = await sendMessage(gmail, {
      to: "test@gmail.com",
      subject: "Test Email",
      body: "Hello from Nebula Mail"
    });

    expect(gmail.users.messages.send).toHaveBeenCalledTimes(1);

    expect(result.id).toBe("test-message-123");

    const call = gmail.users.messages.send.mock.calls[0][0];

    expect(call.userId).toBe("me");
    expect(call.requestBody.raw).toBeTruthy();
  });


  test("setStarred adds STARRED label", async () => {

    const gmail = {
      users: {
        messages: {
          modify: vi.fn().mockResolvedValue({})
        }
      }
    };

    await setStarred(gmail, "email123", true);

    expect(gmail.users.messages.modify).toHaveBeenCalledWith({
      userId: "me",
      id: "email123",
      requestBody: {
        addLabelIds: ["STARRED"]
      }
    });
  });


  test("setReadState marks email as read", async () => {

    const gmail = {
      users: {
        messages: {
          modify: vi.fn().mockResolvedValue({})
        }
      }
    };

    await setReadState(gmail, "email123", true);

    expect(gmail.users.messages.modify).toHaveBeenCalledWith({
      userId: "me",
      id: "email123",
      requestBody: {
        removeLabelIds: ["UNREAD"]
      }
    });
  });

});