"use strict";

const $ = (sel) => document.querySelector(sel);

function showStep(id) {
  document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function setStatus(id, state) {
  const el = $(`#${id}`);
  el.className = `status-icon ${state}`;
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.style.display = "block";
}

$("#btn-setup").addEventListener("click", async () => {
  const email = $("#email").value.trim().toLowerCase();

  // Validate
  if (!email || !email.includes("@")) {
    showError("#error-email", "Please enter a valid email address.");
    return;
  }

  // Disable button
  const btn = $("#btn-setup");
  btn.disabled = true;
  btn.textContent = "Setting up...";

  showStep("step-progress");

  try {
    // OAuth is already registered by background.js on startup
    setStatus("s-oauth", "done");

    // Run setup via background script
    setStatus("s-mail", "working");
    const result = await browser.runtime.sendMessage({
      action: "setup",
      email
    });

    // Update status indicators
    setStatus("s-mail", result.steps.mail?.success ? "done" : "error");

    setStatus("s-cal", "working");
    await new Promise(r => setTimeout(r, 300));
    setStatus("s-cal", result.steps.calendar?.success ? "done" : "error");

    setStatus("s-card", "working");
    await new Promise(r => setTimeout(r, 300));
    setStatus("s-card", result.steps.contacts?.success ? "done" : "error");

    if (result.success) {
      await new Promise(r => setTimeout(r, 500));
      showStep("step-done");
    } else {
      const errors = [];
      if (!result.steps.mail?.success) errors.push("Email: " + (result.steps.mail?.error || "failed"));
      if (!result.steps.calendar?.success) errors.push("Calendar: " + (result.steps.calendar?.error || "failed"));
      if (!result.steps.contacts?.success) errors.push("Contacts: " + (result.steps.contacts?.error || "failed"));
      showError("#error-setup", errors.join("\n"));
    }
  } catch (e) {
    showError("#error-setup", "Setup failed: " + e.message);
  }
});

// Handle Enter key
$("#email").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    $("#btn-setup").click();
  }
});

// Done button closes the tab
$("#btn-done").addEventListener("click", async () => {
  const tab = await browser.tabs.getCurrent();
  browser.tabs.remove(tab.id);
});
