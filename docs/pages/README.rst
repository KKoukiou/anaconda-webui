.. Page content for the Web UI installation steps documentation.

``docs/installation-steps.rst`` is static and uses ``.. include:: pages/<step>/index.rst``
for each step. Edit the ``index.rst`` in each directory to change the documentation.
Add as much content as you need: paragraphs, notes (``.. note::``), figures, and
subsections. The goal is documentation similar to the Fedora Installation Guide
(Installing Using Anaconda) for the GTK UI.

Run ``node docs/generate-docs.js`` to copy screenshots from ``test/reference/`` to
``docs/images/`` (needed when test/reference is not checked out, e.g. in submodule use).

To add a new step, add a section and ``.. include:: pages/<new-step>/index.rst`` in
``installation-steps.rst`` and create the corresponding directory and ``index.rst`` here.
