const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const Channel = require("../models/Channel");
const { isAuthenticated } = require("../middleware/auth");

router.post(
  "/boards/:boardId/channels/:channelId/messages",
  isAuthenticated(),
  async (req, res) => {
    try {
      const { content } = req.body;
      const { channelId } = req.params;

      const channel = await Channel.findOne({
        _id: channelId,
      });

      if (!channel) {
        return res
          .status(403)
          .json({ message: "You are not a member of this channel" });
      }

      const newMessage = new Message({
        content,
        creator: req.user._id,
        channel: channelId,
      });

      await newMessage.save();

      await Channel.findByIdAndUpdate(channelId, {
        $push: { messages: newMessage._id },
      });

      res.status(201).json(newMessage);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

router.get(
  "/boards/:boardId/channels/:channelId/messages",
  isAuthenticated(),
  async (req, res) => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({
        _id: channelId,
        members: req.user._id,
      });

      if (!channel) {
        return res
          .status(403)
          .json({ message: "You are not a member of this channel" });
      }

      const messages = await Message.find({ channel: channelId }).populate('creator', 'firstName lastName');

      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

router.delete(
  "/boards/:boardId/channels/:channelId/messages/:messageId",
  isAuthenticated(),
  async (req, res) => {
    try {
      const messageId = req.params.messageId;

      const message = await Message.findById(messageId);

      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (
        message.creator.toString() !== req.user._id.toString() &&
        req.user._id.toString() !== message.channel.board.admin.toString()
      ) {
        return res
          .status(403)
          .json({ message: "You are not authorized to delete this message" });
      }
      const channelId = req.params.channelId;

      await Channel.findByIdAndUpdate(channelId, {
        $pull: { messages: message._id },
      });

      await message.deleteOne({ _id: message._id });

      res.status(200).json({ message: "Message deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
