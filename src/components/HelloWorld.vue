<script setup lang="ts">
import { onMounted, ref, nextTick, reactive, computed, Ref } from "vue";
import "animate.css";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";

defineProps<{ msg: string }>();

interface Message {
  msgSenderType: string;
  msgType: string;
  index: number;
  isTyping: boolean;
  isAll: boolean;
  syncingContent: string | undefined;
  messageId: string;
  visible: boolean;
  createAtByMs: Date | null | undefined;
  content: string | undefined;
}

interface MessageReq {
  role: string | undefined;
  content: string | undefined;
}

const chatRoom = ref({});
const userId = ref(uuidv4());
const userInput = ref<string>('');
const messages = ref<Message[]>([]);
const isLoading = ref(false);
const messageListScrollTop = ref(0);
const showScrollToBottom = ref(false);
const baseSpeed = ref(50);
const shortPause = ref(200);
const longPause = ref(300);
const paragraphPause = ref(600);
const longPuasePunctuationMarks = ref(["。", "！", "？", "：", ".", "!", "?"]);
const shortPausePunctuationMarks = ref(["，", ",", "、", '"', "“"]);
const currentTyping: Ref<string | undefined> = ref(undefined);
const waitTyping = ref<string[]>([]);
const lastDateTime = ref<Date | null>(null);
const messageListRef = ref<HTMLElement | null>(null);

const displayingMessages = computed(() => {
  return chatRoom.value && messages.value
    ? messages.value.map((message) => {
        if (message.msgSenderType === "MEMBER") {
          return {
            ...message,
            sender: {
              // name: this.chatRoom.member.nickname,
              name: undefined,
            },
            visible: message.visible,
            messageId: message.messageId,
            content: message.content,
            msgType: message.msgType,
            msgSenderType: message.msgSenderType,
            messageTimeDisplay: message.createAtByMs && formatMessageTime(message.createAtByMs),
          };
        } else {
          return {
            ...message,
            sender: {
              name: "小妍",
            },
            messageTimeDisplay: message.createAtByMs && formatMessageTime(message.createAtByMs),
          };
        }
      })
    : [];
});

onMounted(async () => {
  console.log("HelloWorld mounted.");
  chatRoom.value = {
    name: "聊天室",
    chatRoomType: "ONE_TO_TWO_CUSTOMIZED",
    messageList: [],
    expertList: [{ id: userId.value, name: "小妍" }],
  };
});

async function sendMessage() {
  if (!userInput.value || userInput.value.trim() === "" || isLoading.value) {
    return;
  }

  const message: Message = buildMessage("TEXT");

  messages.value.push({
    ...message,
    content: userInput.value,
  });

  await nextTick();

  scrollToChatMessageListBottom();

  isLoading.value = false;

  const reqMessages: MessageReq[] = messages.value.map((item) => {
    return {
      role: item.msgSenderType === "MEMBER" ? "user" : "assistant",
      content:
        item.msgSenderType === "MEMBER" ? item.content : item.syncingContent,
    };
  });

  const msgId = uuidv4();
  fetchStreamMsg(reqMessages, (msg: any) => {
    onMessageReceived(msg, msgId);
  });

  userInput.value = '';
}

async function fetchStreamMsg(messages: MessageReq[], callback: Function) {
  const url = "http://192.168.0.126:11434/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen2.5:7b",
      messages,
      stream: true,
    }),
  });

  // 获取响应流
  if (!response.body) {
    throw new Error("Network response was not ok");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let responseText = "";

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    responseText = decoder.decode(value, { stream: true });

    console.log(responseText, responseText.includes("[DONE]"));
    if (responseText.includes("[DONE]")) {
      const stop = "[DONE]";
      callback(stop);
    } else if (responseText !== "") {
      // 实时显示流式数据
      const msg = responseText.replace("data: ", "");
      try {
        const parseMsg = JSON.parse(msg);
        if (parseMsg !== "") {
          callback(parseMsg.choices[0].delta.content);
        }
      } catch (error) {
        console.log(error);
      }
    }
  }
}

function onMessageReceived(msg: any, msgId: string) {
  if (msg) {
    const baseMessage = {
      msgSenderType: "EXPERT",
      msgType: "TEXT",
    };

    const idx = messages.value.findIndex((m) => m.messageId === msgId);
    if (idx === -1) {
      let isDateVisible = false;
      if (isLastDateVisible()) {
        lastDateTime.value = new Date();
        isDateVisible = true;
      }
      messages.value.push({
        ...baseMessage,
        index: 0,
        isTyping: true,
        isAll: false,
        syncingContent: msg,
        content: "",
        messageId: msgId,
        visible: false,
        createAtByMs: isDateVisible ? lastDateTime.value : null,
      });

      if (currentTyping.value === undefined) {
        currentTyping.value = msgId;
        typeWriter(msgId);
      } else {
        waitTyping.value.push(msgId);
      }
    } else {
      const message = messages.value[idx];

      messages.value.splice(idx, 1, {
        ...message,
        ...(msg !== "[DONE]"
          ? { syncingContent: message.syncingContent + msg }
          : { isAll: true }),
      });
      if (!message.isTyping && currentTyping.value === msgId) {
        typeWriter(msgId);
      }
    }
  }
}

async function typeWriter(msgId: string) {
  if (!msgId) {
    return;
  }
  const idx = messages.value.findIndex((m) => m.messageId === msgId);
  const message = messages.value[idx];
  message.visible = true;
  message.isTyping = true;

  await nextTick();

  const typewriterDiv = document.getElementById("m" + msgId);

  if (message.syncingContent && message.index < message.syncingContent.length) {
    let currentChar =
      message.syncingContent && message.syncingContent[message.index];
    if (
      currentChar === "\\" &&
      message.syncingContent &&
      message.syncingContent[message.index + 1] === "n"
    ) {
      message.index++;
      currentChar = "\n";
    }
    const span = document.createElement("span");
    span.classList.add("fade-in");
    span.textContent =
      currentChar === "\n"
        ? "\n"
        : currentChar !== undefined
        ? currentChar
        : null;
    typewriterDiv && typewriterDiv.appendChild(span);
    setTimeout(() => {
      span.classList.add("show");
    }, 50);
    message.index++;

    if (currentChar) {
      const delay = getDelay(currentChar);
      setTimeout(() => typeWriter(msgId), delay);
    }
  } else if (message.isAll) {
    currentTyping.value = waitTyping.value.shift();
    currentTyping.value && typeWriter(currentTyping.value);
  } else {
    message.isTyping = false;
  }
  scrollToChatMessageListBottom();
}

function getDelay(currentChar: string) {
  if (longPuasePunctuationMarks.value.includes(currentChar)) {
    return longPause.value;
  } else if (currentChar === "\n") {
    return paragraphPause.value;
  } else if (shortPausePunctuationMarks.value.includes(currentChar)) {
    return shortPause.value;
  }
  return Math.random() * baseSpeed.value + 10; // 保持快速的随机打字节奏
}
function isLastDateVisible() {
  const now = dayjs();
  return (
    lastDateTime.value === undefined ||
    dayjs(lastDateTime.value).isBefore(now.subtract(5, "minutes"))
  );
}

function scrollToChatMessageListBottom() {
  if (messageListRef.value) {
    const targetPos =
      messageListRef.value.scrollHeight - messageListRef.value.clientHeight;
    if (messageListRef.value.scrollTo) {
      messageListRef.value.scrollTo({ top: targetPos, behavior: "smooth" });
    }
  }
}

function buildMessage(msgType: string) {
  const message = {
    messageId: uuidv4(),
    msgSenderId: userId.value,
    msgSenderType: "MEMBER",
    msgType: msgType,
    visible: true,
    index: 0,
    isTyping: false,
    isAll: true,
    syncingContent: undefined,
    content: undefined,
  };
  let isDateVisible = false;
  if (isLastDateVisible()) {
    lastDateTime.value = new Date();
    isDateVisible = true;
  }
  return {
    ...message,
    createAtByMs: isDateVisible ? lastDateTime.value : undefined,
  };
}

function formatMessageTime(time: Date) {
  if (!time) {
    return;
  }
  const now = dayjs();
  const date = dayjs(time);
  let format = "HH:mm";
  if (date.isBefore(now.startOf("day"))) {
    format = "MM-DD " + format;
  }
  if (date.isBefore(now.startOf("year"))) {
    format = "YYYY-" + format;
  }
  return format.length > 0 ? date.format(format) : "";
}

function onMessageListScroll() {
  if (messageListRef.value) {
    const { scrollTop, clientHeight, scrollHeight } = messageListRef.value;
    if (scrollTop && clientHeight && scrollHeight) {
      messageListScrollTop.value = scrollTop;
      showScrollToBottom.value = scrollTop + clientHeight < scrollHeight - 8;
    }
  }
}
</script>

<template>
  <div class="chat-room-wrapper">
    <div class="chat-room__left">
      <div
        ref="messageListRef"
        class="chat-room-message-list-wrapper"
        @scroll="onMessageListScroll"
      >
        <div class="chat-room-message-list">
          <template v-for="(message, midx) in displayingMessages">
            <template v-if="message.visible">
              <div class="message-time" :key="'mt' + midx">
                {{ message.messageTimeDisplay }}
              </div>
              <div
                :key="midx"
                :class="[
                  'chat-room-message',
                  message.msgSenderType.toLowerCase(),
                ]"
              >
                <div class="sender-info">
                  <div class="masquerade-avatar">
                    <img
                      src="/src/assets/default-user-avatar.png"
                      alt="Attender Avatar"
                    />
                  </div>
                </div>
                <div
                  :class="['content', message.msgType === 'TEXT' ? 'text' : '']"
                >
                  <div class="sender-name">{{ message.sender.name }}</div>
                  <div v-if="message.msgType === 'TEXT'" class="content-text">
                    <p v-if="message.content" v-html="message.content" />
                    <p
                      v-else-if="message.visible"
                      :id="`m${message.messageId}`"
                    />
                  </div>
                </div>
              </div>
            </template>
          </template>
        </div>
        <div
          v-if="showScrollToBottom"
          class="scroll-to-bottom"
          @click="scrollToChatMessageListBottom"
        />
      </div>
      <div v-if="chatRoom" class="chat-room-footer">
        <input
          class="sending-input"
          v-model="userInput"
          placeholder="说些什么..."
          :disabled="isLoading"
          @keyup.enter="sendMessage"
        />

        <div
          :class="{
            'sender-button': true,
            disabled: !userInput || userInput === '' || isLoading,
          }"
          @click="sendMessage"
        />
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
/* 渐入效果 */
/deep/ .fade-in {
  opacity: 0;
  transition: opacity 0.1s ease-in-out; /* 更快的淡入速度 */
}

/deep/ .fade-in.show {
  opacity: 1;
}
.chat-room-wrapper {
  position: relative;
  height: 100%;
  overflow: hidden;
  display: flex;
  justify-content: center;
  .chat-room__left {
    width: 500px;
  }
  .chat-room__right {
    width: 400px;
    height: 100%;
    border-left: 1px solid #eef0f2;
    position: relative;

    &.chat-room__right--none {
      display: none;
    }

    .chat-room__right--close {
      position: absolute;
      left: -40px;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 30px;
      border: 1px solid #eef0f2;
      border-right: none;
      border-radius: 20px 0 0 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      background-color: #fff;
    }

    .process-log-list-wrap {
      height: 100%;
      padding: 20px;
      overflow-y: scroll;

      .process-log {
        margin-bottom: 20px;

        .process-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          line-height: 24px;

          .process-node {
            font-weight: bold;
            font-size: 14px;
          }
        }

        .process-content {
          font-size: 14px;

          .process-item {
            margin-top: 10px;
            .item-content {
              font-size: 14px;

              > span {
                font-size: 14px;
              }
            }
            .item-footer {
              font-size: 12px;
              text-align: right;
            }
          }
        }
      }
    }
  }
  .chat-room-message-list-wrapper {
    height: calc(100% - 120px);
    padding: 60px 12px 8px 12px;
    overflow-y: scroll;
    overflow-x: hidden;
    word-break: break-all;
    margin-top: -40px;
    &::-webkit-scrollbar {
      display: none;
    }
    .chat-room-message-list {
      display: flex;
      flex-direction: column;
      & > * {
        margin-bottom: 24px;
      }

      & > *:last-child {
        margin-bottom: 0;
      }
      .message-time {
        text-align: center;
        font-size: 12px;
        margin-bottom: 4px;
        color: #d9d9d9;
      }
      .chat-room-message {
        flex: 1 0 max-content;
        display: flex;
        & > * {
          margin: 0 12px 0 0;
        }
        & > *:last-child {
          margin: 0 12px 0 0;
        }
        .share-checkbox {
          display: inline-block;
        }
        .sender-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          .masquerade-avatar {
            height: 36px;
            width: 36px;

            img {
              width: 100%;
              height: 100%;
              border-radius: 50%;
            }
          }
          // .sender-name {
          //   margin-top: 4px;
          //   text-align: center;
          //   max-width: 64px;
          //   word-wrap: break-word;
          //   font-size: 12px;
          //   line-height: 16px;
          //   color: var(--secondary-color);
          // }
        }
        .content {
          position: relative;
          height: max-content;
          .sender-name {
            position: absolute;
            top: -20px;
            left: 2px;
            font-size: 12px;
            line-height: 16px;
            width: max-content;
            color: var(--secondary-color);
          }
          .content-image {
            max-width: 150px;
            max-height: 150px;
            border-radius: 8px;
            position: relative;
            cursor: pointer;
          }
          .content-text {
            position: relative;
            border-radius: 8px;
            padding: 16px;
            color: #606266;
            background-color: #ebebeb;
            line-height: 20px;
            font-size: 16px;
            white-space: pre-wrap;
            & p {
              margin: 0;
            }

            .button-retry {
              position: absolute;
              top: 0;
              right: 0;
              color: #ffffff;
              background-color: #b30000;
              border-radius: 50%;
              width: 20px;
              height: 20px;
              line-height: 20px;
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              transform: translateX(4px) translateY(-4px);
            }
          }
          .content-footer {
            margin-top: 4px;
            display: flex;
            align-items: center;
            & > * {
              margin-right: 7px;
            }

            & > *:last-child {
              margin-right: 0;
            }
            .comment-button {
              cursor: pointer;
              position: relative;
              height: 20px;
              width: 20px;
              line-height: 20px;
              color: var(--primary-color);
              // &::after {
              //   content: '\e8ad';
              //   font-family: 'masquerade-icons';
              //   position: absolute;
              //   top: 0;
              //   left: 0;
              //   width: 100%;
              //   height: 100%;
              //   line-height: 16px;
              //   font-size: 14px;
              // }
              // &.button-dislike{
              //   transform: rotate(180deg);
              // }
              // &.filled {
              //   &::after {
              //     content: '\e8c3';
              //   }
              // }
              &::after {
                content: "";
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                line-height: 20px;
                background-repeat: no-repeat;
                background-size: contain;
                background-position: bottom center;
              }
              &.button-like {
                &::after {
                  background-image: url("~@/assets/remark-good.png");
                }
                &.filled {
                  &::after {
                    background-image: url("~@/assets/remark-good-activated.png");
                  }
                }
              }
              &.button-dislike {
                &::after {
                  background-image: url("~@/assets/remark-bad.png");
                }
                &.filled {
                  &::after {
                    background-image: url("~@/assets/remark-bad-activated.png");
                  }
                }
              }
              &.button-reply {
                width: max-content;
                font-weight: 500;
              }
            }
            .additional-button {
              margin: 16px 0;
              width: 100%;
              border-radius: 8px;
              .additional-button-text {
                font-size: 16px;
                line-height: 16px;
              }
            }
          }

          &.text {
            &::before {
              content: "";
              position: absolute;
              top: 20px;
              left: -8px;
              transform: translateY(-50%) scaleX(-1);
              width: 0;
              height: 0;
              border-style: solid;
              border-width: 4px 4px;
              border-color: transparent transparent transparent #ebebeb;
            }
          }
        }
        &.member {
          flex-direction: row-reverse;
          .content {
            color: var(--background-color);
            .content-text {
              color: #ffffff;
              background-color: #24ac56;
            }
          }
          & > * {
            margin: 0 0 0 12px;
          }

          & > *:last-child {
            margin: 0 0 0 12px;
          }
          .sender-info {
            .sender-name {
              color: var(--text-color);
            }
          }
          .content {
            &.sender-name {
              left: initial;
              right: 12px;
              text-align: right;
            }
            &::before {
              left: auto;
              right: -8px;
              transform: translateY(-50%) scaleX(1);
              border-color: transparent transparent transparent #24ac56;
            }
          }
        }

        &.expert {
          .content-text {
            cursor: pointer;
          }
        }
      }
    }
    .scroll-to-bottom {
      position: fixed;
      bottom: 72px;
      right: 24px;
      width: 32px;
      height: 32px;
      font-size: 18px;
      cursor: pointer;
      &.hidden {
        display: none;
      }
      &::after {
        content: "\e949";
        font-family: "masquerade-icons";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        line-height: 32px;
        font-weight: 700;
        text-align: center;
        background-color: rgba(246, 246, 246, 0.6);
        border-radius: 50%;
      }
    }
  }
  .chat-room-footer {
    height: 48px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    font-size: 14px;
    background-color: var(--background-color);
    position: relative;
    .sending-input {
      width: 100%;
      height: 48px;
      padding: 0 60px 0 20px;
      font-size: inherit;
      border: none;
      box-shadow: none;
      background-color: #e6ecff;
      border-radius: 48px;
      color: #000;
      margin-right: 8px;
      &::placeholder {
        color: #242424;
      }
    }
    .uploader-button {
      position: absolute;
      width: 20px;
      right: 60px;
      cursor: pointer;
      pointer-events: auto;

      /deep/ .ant-upload-select {
        display: block;
      }

      .uploader-img {
        width: 20px;
        height: 20px;
        background-image: url("~@/assets/uploader-button.png");
        background-repeat: no-repeat;
        background-size: contain;
        background-position: center center;

        &.disabled {
          cursor: not-allowed;
          pointer-events: none;
          filter: opacity(0.6);
        }
      }
      &.disabled {
        cursor: not-allowed;
        pointer-events: none;
        filter: opacity(0.2);
      }
    }
    .sender-button {
      position: absolute;
      width: 24px;
      height: 24px;
      right: 40px;
      cursor: pointer;
      pointer-events: auto;
      background-image: url("src/assets/sender-button.png");
      background-repeat: no-repeat;
      background-size: contain;
      background-position: center center;
      &.disabled {
        cursor: not-allowed;
        pointer-events: none;
        filter: opacity(0.2);
      }
    }
    .no-permission-text {
      font-size: inherit;
      color: var(--secondary-color);
    }
    .action-button {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: inherit;
      .button-icon {
        display: inline-block;
        width: 1em;
        height: 1em;
        background-image: url("~@/assets/icon-link.png");
        background-size: contain;
        background-repeat: no-repeat;
        margin-right: 4px;
      }
      .action-button-text {
        font-size: inherit;
      }
    }
    .share-link-manual {
      padding: 8px 16px;
      width: 100%;
      position: absolute;
      top: -40px;
      left: 0;
      background-color: var(--background-color);
      transform: translateY(100%);
      animation-name: modal-showup;
      animation-duration: 0.3s;
      animation-fill-mode: forwards;
      .share-link-manual-text {
        width: 100%;
      }
    }
  }
}
</style>
<style lang="less">
.modal-option-group.order-type {
  display: flex;
  flex-direction: column;
  width: 80%;
  margin-top: 16px;
  & > * {
    border: none;
    border: 1px solid #d9d9d9;
    border-radius: 32px;
    margin-bottom: 24px;
  }
  & > *:first-child {
    border-top: 1px solid #d9d9d9;
  }
  & > *:last-child {
    margin-bottom: 0;
  }
  .modal-option-group-option {
    padding: 8px 16px;
    height: max-content;
    &::before {
      background: none;
    }
    span:nth-child(2) {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    .option-title {
      width: 45%;
      margin-left: 16px;
      line-height: 32px;
      text-align: left;
    }
    .option-text {
      line-height: 32px;
      margin-left: 4px;
      &.text-number {
        color: #00bfa5;
        font-weight: 400;
        font-size: 24px;
      }
    }
    &.ant-radio-button-wrapper-checked {
      border-top: 1px solid rgba(97, 141, 250, 0.8);
      .option-text {
        &.text-number {
          color: #618dfa;
        }
      }
    }
  }
}
</style>
